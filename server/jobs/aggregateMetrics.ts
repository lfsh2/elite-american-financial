/**
 * Metrics Aggregation Job
 * 
 * Pre-computes analytics metrics from the local database
 * and caches them in Redis for instant dashboard loads.
 */

import { Job } from 'bullmq';
import { db } from '../db';
import { smsMessages, voiceCalls, accounts } from '../../shared/schema';
import { eq, and, gte, lte, count, sum, sql } from 'drizzle-orm';
import { redisService, CacheKeys, CACHE_TTL, STALE_TTL } from '../services/redisService';
import type { AggregateMetricsJob } from '../services/queueService';

/**
 * Process metrics aggregation job
 */
export async function processAggregateMetricsJob(job: Job<AggregateMetricsJob>): Promise<void> {
  const { accountId, period } = job.data;
  
  console.log(`[Metrics Job] Aggregating ${period} metrics for account ${accountId}`);

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get message stats from database
    const messageStats = await db
      .select({
        direction: smsMessages.direction,
        status: smsMessages.status,
        count: count(),
      })
      .from(smsMessages)
      .where(
        and(
          eq(smsMessages.accountId, accountId),
          gte(smsMessages.sentAt, sixMonthsAgo)
        )
      )
      .groupBy(smsMessages.direction, smsMessages.status);

    // Get call stats from database
    const callStats = await db
      .select({
        direction: voiceCalls.direction,
        count: count(),
        totalDuration: sum(voiceCalls.duration),
      })
      .from(voiceCalls)
      .where(
        and(
          eq(voiceCalls.accountId, accountId),
          gte(voiceCalls.startTime, sixMonthsAgo)
        )
      )
      .groupBy(voiceCalls.direction);

    // Get daily message counts for charts
    const dailyMessages = await db
      .select({
        date: sql<string>`DATE(${smsMessages.sentAt})`,
        direction: smsMessages.direction,
        count: count(),
      })
      .from(smsMessages)
      .where(
        and(
          eq(smsMessages.accountId, accountId),
          gte(smsMessages.sentAt, sixMonthsAgo)
        )
      )
      .groupBy(sql`DATE(${smsMessages.sentAt})`, smsMessages.direction);

    // Get daily call counts for charts
    const dailyCalls = await db
      .select({
        date: sql<string>`DATE(${voiceCalls.startTime})`,
        count: count(),
        totalDuration: sum(voiceCalls.duration),
      })
      .from(voiceCalls)
      .where(
        and(
          eq(voiceCalls.accountId, accountId),
          gte(voiceCalls.startTime, sixMonthsAgo)
        )
      )
      .groupBy(sql`DATE(${voiceCalls.startTime})`);

    // Calculate aggregated metrics
    let totalSent = 0;
    let totalReceived = 0;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const stat of messageStats) {
      const cnt = Number(stat.count);
      if (stat.direction?.startsWith('outbound')) {
        totalSent += cnt;
        if (stat.status === 'delivered') totalDelivered += cnt;
        if (stat.status === 'failed' || stat.status === 'undelivered') totalFailed += cnt;
      }
      if (stat.direction === 'inbound') {
        totalReceived += cnt;
      }
    }

    let totalOutboundCalls = 0;
    let totalInboundCalls = 0;
    let totalCallDuration = 0;

    for (const stat of callStats) {
      const cnt = Number(stat.count);
      if (stat.direction?.startsWith('outbound')) totalOutboundCalls += cnt;
      if (stat.direction === 'inbound') totalInboundCalls += cnt;
      totalCallDuration += Number(stat.totalDuration) || 0;
    }

    const metrics = {
      messages: {
        total: totalSent + totalReceived,
        sent: totalSent,
        received: totalReceived,
        delivered: totalDelivered,
        failed: totalFailed,
        deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 100,
      },
      calls: {
        total: totalOutboundCalls + totalInboundCalls,
        outbound: totalOutboundCalls,
        inbound: totalInboundCalls,
        totalDuration: totalCallDuration,
        avgDuration: (totalOutboundCalls + totalInboundCalls) > 0 
          ? Math.round(totalCallDuration / (totalOutboundCalls + totalInboundCalls)) 
          : 0,
      },
      lastUpdated: now.toISOString(),
    };

    // Build chart data from daily aggregates
    const chartData = buildChartData(dailyMessages, dailyCalls, sixMonthsAgo, now);

    // Cache metrics
    await redisService.set(
      CacheKeys.metrics(accountId),
      metrics,
      CACHE_TTL.METRICS,
      STALE_TTL.METRICS
    );

    // Cache chart data
    await redisService.set(
      CacheKeys.chartData(accountId, '6m'),
      chartData,
      CACHE_TTL.CHART_DATA,
      STALE_TTL.CHART_DATA
    );

    console.log(`[Metrics Job] Cached metrics for account ${accountId}: ${totalSent} sent, ${totalReceived} received`);

    await job.updateProgress(100);
  } catch (error) {
    console.error(`[Metrics Job] Error aggregating metrics for account ${accountId}:`, error);
    throw error;
  }
}

/**
 * Build chart data from daily aggregates
 */
function buildChartData(
  dailyMessages: any[],
  dailyCalls: any[],
  startDate: Date,
  endDate: Date
): any {
  // Initialize daily data structure
  const dailyData: Record<string, { messages: number; calls: number; duration: number }> = {};
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyData[key] = { messages: 0, calls: 0, duration: 0 };
  }

  // Populate message counts
  for (const row of dailyMessages) {
    const key = row.date;
    if (dailyData[key]) {
      dailyData[key].messages += Number(row.count);
    }
  }

  // Populate call counts
  for (const row of dailyCalls) {
    const key = row.date;
    if (dailyData[key]) {
      dailyData[key].calls += Number(row.count);
      dailyData[key].duration += Number(row.totalDuration) || 0;
    }
  }

  // Convert to array
  const daily = Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      messages: data.messages,
      calls: data.calls,
    }));

  // Monthly aggregation
  const monthlyData: Record<string, { messages: number; calls: number }> = {};
  for (const day of daily) {
    const month = day.date.substring(0, 7);
    if (!monthlyData[month]) {
      monthlyData[month] = { messages: 0, calls: 0 };
    }
    monthlyData[month].messages += day.messages;
    monthlyData[month].calls += day.calls;
  }

  const monthly = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      messages: data.messages,
      calls: data.calls,
    }));

  // Weekly aggregation (last 12 weeks)
  const weeklyData: { week: string; messages: number; calls: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let weekMessages = 0;
    let weekCalls = 0;

    for (const day of daily) {
      const dayDate = new Date(day.date);
      if (dayDate >= weekStart && dayDate <= weekEnd) {
        weekMessages += day.messages;
        weekCalls += day.calls;
      }
    }

    weeklyData.push({
      week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      messages: weekMessages,
      calls: weekCalls,
    });
  }

  return {
    daily: daily.slice(-30), // Last 30 days for daily view
    weekly: weeklyData,
    monthly,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Aggregate metrics for all accounts (scheduled job)
 */
export async function aggregateAllAccountMetrics(): Promise<void> {
  console.log('[Metrics Job] Starting aggregation for all accounts');

  try {
    const allAccounts = await db.select({ id: accounts.id }).from(accounts);

    for (const account of allAccounts) {
      try {
        await processAggregateMetricsJob({
          data: { accountId: account.id, period: 'daily' },
          updateProgress: async () => {},
        } as any);
      } catch (error) {
        console.error(`[Metrics Job] Error aggregating account ${account.id}:`, error);
      }
    }

    console.log(`[Metrics Job] Completed aggregation for ${allAccounts.length} accounts`);
  } catch (error) {
    console.error('[Metrics Job] Error in aggregateAllAccountMetrics:', error);
  }
}
