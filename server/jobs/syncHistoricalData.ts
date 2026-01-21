/**
 * Historical Data Sync Job
 * 
 * Syncs historical messages and calls from providers (Twilio, Commio, Bandwidth)
 * to the local PostgreSQL database. This enables instant dashboard loads
 * by querying local data instead of external APIs.
 */

import { Job } from 'bullmq';
import { db } from '../db';
import { smsMessages, voiceCalls, accounts } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { TwilioProvider } from '../providers/twilio.provider';
import { CommioProvider } from '../providers/commio.provider';
import { BandwidthProvider } from '../providers/bandwidth.provider';
import { redisService, CacheKeys, CACHE_TTL, STALE_TTL } from '../services/redisService';
import type { SyncHistoricalDataJob, SyncIncrementalJob } from '../services/queueService';

const BATCH_SIZE = 1000;

/**
 * Process historical data sync job
 */
export async function processHistoricalSyncJob(job: Job<SyncHistoricalDataJob>): Promise<void> {
  const { accountId, provider, accountSid, authToken, monthsBack = 6 } = job.data;
  
  console.log(`[Sync Job] Starting historical sync for account ${accountId} (${provider}), ${monthsBack} months back`);

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);

    // Get provider instance
    const providerInstance = createProvider(provider, accountSid, authToken);
    if (!providerInstance) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Validate credentials
    const isValid = await providerInstance.validateCredentials();
    if (!isValid) {
      throw new Error('Invalid provider credentials');
    }

    // Update job progress
    await job.updateProgress(10);

    // Sync messages
    console.log(`[Sync Job] Fetching messages from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    const messages = await providerInstance.getMessages({ startDate, endDate });
    console.log(`[Sync Job] Fetched ${messages.length} messages`);

    await job.updateProgress(40);

    // Store messages in batches
    let messagesStored = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      await storeMessages(accountId, batch);
      messagesStored += batch.length;
      
      // Update progress
      const messageProgress = 40 + (messagesStored / messages.length) * 25;
      await job.updateProgress(Math.round(messageProgress));
    }

    console.log(`[Sync Job] Stored ${messagesStored} messages`);

    // Sync calls
    console.log(`[Sync Job] Fetching calls...`);
    const calls = await providerInstance.getCalls({ startDate, endDate });
    console.log(`[Sync Job] Fetched ${calls.length} calls`);

    await job.updateProgress(70);

    // Store calls in batches
    let callsStored = 0;
    for (let i = 0; i < calls.length; i += BATCH_SIZE) {
      const batch = calls.slice(i, i + BATCH_SIZE);
      await storeCalls(accountId, batch);
      callsStored += batch.length;
      
      const callProgress = 70 + (callsStored / calls.length) * 20;
      await job.updateProgress(Math.round(callProgress));
    }

    console.log(`[Sync Job] Stored ${callsStored} calls`);

    // Update last sync timestamp
    await db
      .update(accounts)
      .set({ lastSyncAt: new Date() })
      .where(eq(accounts.id, accountId));

    // Invalidate cache to force refresh with new data
    await redisService.invalidateAccount(accountId);

    // Pre-compute and cache analytics
    await preComputeAnalytics(accountId, messages, calls);

    await job.updateProgress(100);

    console.log(`[Sync Job] Completed historical sync for account ${accountId}`);
  } catch (error) {
    console.error(`[Sync Job] Error syncing account ${accountId}:`, error);
    throw error;
  }
}

/**
 * Process incremental sync job (daily sync to catch missed webhooks)
 */
export async function processIncrementalSyncJob(job: Job<SyncIncrementalJob>): Promise<void> {
  const { accountId, provider, accountSid, authToken, lastSyncDate } = job.data;
  
  console.log(`[Sync Job] Starting incremental sync for account ${accountId} since ${lastSyncDate}`);

  try {
    const startDate = new Date(lastSyncDate);
    const endDate = new Date();

    const providerInstance = createProvider(provider, accountSid, authToken);
    if (!providerInstance) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Fetch only new data since last sync
    const messages = await providerInstance.getMessages({ startDate, endDate });
    const calls = await providerInstance.getCalls({ startDate, endDate });

    console.log(`[Sync Job] Incremental: ${messages.length} messages, ${calls.length} calls`);

    // Store with upsert logic to avoid duplicates
    await storeMessages(accountId, messages);
    await storeCalls(accountId, calls);

    // Update last sync timestamp
    await db
      .update(accounts)
      .set({ lastSyncAt: new Date() })
      .where(eq(accounts.id, accountId));

    // Invalidate cache
    await redisService.invalidateAccount(accountId);

    console.log(`[Sync Job] Completed incremental sync for account ${accountId}`);
  } catch (error) {
    console.error(`[Sync Job] Error in incremental sync for account ${accountId}:`, error);
    throw error;
  }
}

/**
 * Create provider instance based on provider type
 */
function createProvider(provider: string, accountSid: string, authToken: string) {
  switch (provider) {
    case 'twilio':
      return new TwilioProvider({ accountSid, authToken });
    case 'commio':
      return new CommioProvider({ accountSid, authToken });
    case 'bandwidth':
      return new BandwidthProvider({ accountSid, authToken });
    default:
      return null;
  }
}

/**
 * Store messages in database with deduplication
 */
async function storeMessages(accountId: number, messages: any[]): Promise<void> {
  for (const msg of messages) {
    try {
      // Check if message already exists
      const existing = await db
        .select({ id: smsMessages.id })
        .from(smsMessages)
        .where(eq(smsMessages.messageSid, msg.sid))
        .limit(1);

      if (existing.length > 0) {
        // Update existing message status
        await db
          .update(smsMessages)
          .set({
            status: msg.status,
          })
          .where(eq(smsMessages.id, existing[0].id));
      } else {
        // Insert new message
        await db.insert(smsMessages).values({
          userId: 1, // Default user - should be looked up based on account
          accountId: accountId,
          to: msg.to,
          from: msg.from,
          body: msg.body || '',
          status: msg.status,
          direction: msg.direction,
          sentAt: new Date(msg.dateSent || msg.dateCreated),
          messageSid: msg.sid,
        });
      }
    } catch (error) {
      // Log but continue with other messages
      console.error(`[Sync Job] Error storing message ${msg.sid}:`, error);
    }
  }
}

/**
 * Store calls in database with deduplication
 */
async function storeCalls(accountId: number, calls: any[]): Promise<void> {
  for (const call of calls) {
    try {
      // Check if call already exists
      const existing = await db
        .select({ id: voiceCalls.id })
        .from(voiceCalls)
        .where(eq(voiceCalls.callSid, call.sid))
        .limit(1);

      if (existing.length > 0) {
        // Update existing call
        await db
          .update(voiceCalls)
          .set({
            status: call.status,
            duration: parseInt(call.duration) || 0,
            endTime: call.endTime ? new Date(call.endTime) : undefined,
          })
          .where(eq(voiceCalls.id, existing[0].id));
      } else {
        // Insert new call
        await db.insert(voiceCalls).values({
          userId: 1,
          accountId: accountId,
          to: call.to,
          from: call.from,
          status: call.status,
          direction: call.direction,
          duration: parseInt(call.duration) || 0,
          startTime: new Date(call.startTime),
          endTime: call.endTime ? new Date(call.endTime) : undefined,
          callSid: call.sid,
        });
      }
    } catch (error) {
      console.error(`[Sync Job] Error storing call ${call.sid}:`, error);
    }
  }
}

/**
 * Pre-compute analytics and cache them
 */
async function preComputeAnalytics(accountId: number, messages: any[], calls: any[]): Promise<void> {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate metrics
    const messagesToday = messages.filter(m => new Date(m.dateSent) >= startOfDay);
    const messagesThisWeek = messages.filter(m => new Date(m.dateSent) >= startOfWeek);
    const messagesThisMonth = messages.filter(m => new Date(m.dateSent) >= startOfMonth);

    const callsToday = calls.filter(c => new Date(c.startTime) >= startOfDay);
    const callsThisWeek = calls.filter(c => new Date(c.startTime) >= startOfWeek);
    const callsThisMonth = calls.filter(c => new Date(c.startTime) >= startOfMonth);

    const outboundMonth = messagesThisMonth.filter(m => m.direction?.startsWith('outbound'));
    const deliveredMonth = outboundMonth.filter(m => m.status === 'delivered').length;

    const metrics = {
      totalMessagesSentToday: messagesToday.filter(m => m.direction?.startsWith('outbound')).length,
      totalMessagesReceivedToday: messagesToday.filter(m => m.direction === 'inbound').length,
      totalMessagesSentThisWeek: messagesThisWeek.filter(m => m.direction?.startsWith('outbound')).length,
      totalMessagesSentThisMonth: outboundMonth.length,
      totalCallsToday: callsToday.length,
      totalCallsThisWeek: callsThisWeek.length,
      totalCallDurationToday: callsToday.reduce((sum, c) => sum + (parseInt(c.duration) || 0), 0),
      deliveryRate: outboundMonth.length > 0 ? (deliveredMonth / outboundMonth.length) * 100 : 100,
    };

    // Cache metrics
    await redisService.set(
      CacheKeys.metrics(accountId),
      metrics,
      CACHE_TTL.METRICS,
      STALE_TTL.METRICS
    );

    // Pre-aggregate chart data (daily counts for 6 months)
    const chartData = generateChartData(messages, calls);
    await redisService.set(
      CacheKeys.chartData(accountId, '6m'),
      chartData,
      CACHE_TTL.CHART_DATA,
      STALE_TTL.CHART_DATA
    );

    console.log(`[Sync Job] Pre-computed and cached analytics for account ${accountId}`);
  } catch (error) {
    console.error(`[Sync Job] Error pre-computing analytics:`, error);
  }
}

/**
 * Generate chart data from messages and calls
 */
function generateChartData(messages: any[], calls: any[]): any {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Daily aggregation
  const dailyData: Record<string, { messages: number; calls: number }> = {};
  
  // Initialize all days
  for (let d = new Date(sixMonthsAgo); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyData[key] = { messages: 0, calls: 0 };
  }

  // Count messages per day
  for (const msg of messages) {
    const date = new Date(msg.dateSent || msg.dateCreated);
    const key = date.toISOString().split('T')[0];
    if (dailyData[key]) {
      dailyData[key].messages++;
    }
  }

  // Count calls per day
  for (const call of calls) {
    const date = new Date(call.startTime);
    const key = date.toISOString().split('T')[0];
    if (dailyData[key]) {
      dailyData[key].calls++;
    }
  }

  // Convert to array format
  const daily = Object.entries(dailyData).map(([date, data]) => ({
    date,
    messages: data.messages,
    calls: data.calls,
  }));

  // Monthly aggregation
  const monthlyData: Record<string, { messages: number; calls: number }> = {};
  for (const day of daily) {
    const month = day.date.substring(0, 7); // YYYY-MM
    if (!monthlyData[month]) {
      monthlyData[month] = { messages: 0, calls: 0 };
    }
    monthlyData[month].messages += day.messages;
    monthlyData[month].calls += day.calls;
  }

  const monthly = Object.entries(monthlyData).map(([month, data]) => ({
    month,
    messages: data.messages,
    calls: data.calls,
  }));

  return { daily, monthly };
}
