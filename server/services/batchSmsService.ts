import { db } from '../db';
import { smsMessages, smsCampaigns, campaignRecipients } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import Twilio from 'twilio';

interface BatchRecipient {
  phone: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  [key: string]: any; // Allow custom fields like dollar_amount, etc.
}

interface PhoneNumberConfig {
  phoneNumber: string;
  provider: 'twilio' | 'commio';
  accountId?: number;
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  commioAccountId?: string; // ThinQ numeric account ID for URL path
}

interface BatchSendOptions {
  recipients: BatchRecipient[];
  message: string;
  phoneNumbers: PhoneNumberConfig[];
  campaignId?: number;
  userId: number;
  messagesPerNumber?: number; // Default 2000
  concurrentPerNumber?: number; // Concurrent requests per number, default 10
  onProgress?: (progress: BatchProgress) => void;
  
  // Drip mode settings
  dripMode?: boolean; // Enable drip mode scheduling
  messagesPerMinute?: number; // Rate limit per number (default 30 = safe)
  startTime?: Date; // When to start sending (for scheduled campaigns)
  spreadOverHours?: number; // Spread messages over X hours
  
  // For resume: total campaign recipients (not just pending)
  totalCampaignRecipients?: number;
}

interface BatchProgress {
  total: number;
  sent: number;
  failed: number;
  inProgress: number;
  byNumber: Record<string, { sent: number; failed: number; pending: number }>;
  estimatedCompletionTime?: Date;
  currentRate?: number; // Messages per minute
}

interface BatchResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ phone: string; error: string }>;
  duration: number;
}

// Store active batch jobs for progress tracking
const activeBatchJobs: Map<string, BatchProgress & { campaignId?: number; startTime: number }> = new Map();

class BatchSmsService {
  private twilioClients: Map<string, Twilio.Twilio> = new Map();

  // Get progress for a batch job
  getJobProgress(jobId: string): (BatchProgress & { campaignId?: number; startTime: number }) | null {
    return activeBatchJobs.get(jobId) || null;
  }

  // Get progress for a campaign
  getCampaignProgress(campaignId: number): (BatchProgress & { jobId: string; startTime: number }) | null {
    for (const [jobId, progress] of activeBatchJobs.entries()) {
      if (progress.campaignId === campaignId) {
        return { ...progress, jobId };
      }
    }
    return null;
  }

  // Get aggregated stats across all active batch jobs (for dashboard)
  getActiveSendingStats(): { totalSent: number; totalFailed: number; totalInProgress: number; activeCampaigns: number; jobs: Array<{ jobId: string; campaignId?: number; sent: number; failed: number; total: number; currentRate?: number }> } {
    let totalSent = 0;
    let totalFailed = 0;
    let totalInProgress = 0;
    const jobs: Array<{ jobId: string; campaignId?: number; sent: number; failed: number; total: number; currentRate?: number }> = [];

    for (const [jobId, progress] of activeBatchJobs.entries()) {
      totalSent += progress.sent;
      totalFailed += progress.failed;
      totalInProgress += progress.inProgress;
      jobs.push({
        jobId,
        campaignId: progress.campaignId,
        sent: progress.sent,
        failed: progress.failed,
        total: progress.total,
        currentRate: progress.currentRate,
      });
    }

    return { totalSent, totalFailed, totalInProgress, activeCampaigns: jobs.length, jobs };
  }

  private getTwilioClient(accountSid: string, authToken: string): Twilio.Twilio {
    const key = `${accountSid}`;
    if (!this.twilioClients.has(key)) {
      this.twilioClients.set(key, Twilio(accountSid, authToken));
    }
    return this.twilioClients.get(key)!;
  }

  private applyMergeTags(message: string, recipient: BatchRecipient): string {
    let result = message;
    
    const firstName = recipient.firstName || recipient.name?.split(' ')[0] || '';
    const lastName = recipient.lastName || recipient.name?.split(' ').slice(1).join(' ') || '';
    
    // Support both {{firstName}} and {first_name} formats
    result = result.replace(/\{\{firstName\}\}/gi, firstName);
    result = result.replace(/\{first_name\}/gi, firstName);
    result = result.replace(/\{\{lastName\}\}/gi, lastName);
    result = result.replace(/\{last_name\}/gi, lastName);
    result = result.replace(/\{\{phone\}\}/gi, recipient.phone);
    result = result.replace(/\{phone\}/gi, recipient.phone);
    result = result.replace(/\{\{phoneNumber\}\}/gi, recipient.phone);
    result = result.replace(/\{phone_number\}/gi, recipient.phone);
    result = result.replace(/\{\{name\}\}/gi, recipient.name || firstName);
    result = result.replace(/\{name\}/gi, recipient.name || firstName);
    
    // Helper to format currency values
    const formatCurrencyValue = (value: string, fieldName: string): string => {
      const valueStr = String(value).trim();
      const lowerField = fieldName.toLowerCase();
      
      // Check if this looks like a numeric value (with optional parens, $, commas)
      const looksLikeNumber = /^\(?[\d,]+\.?\d*\)?$/.test(valueStr);
      const isCurrencyField = lowerField.includes('debt') || 
                             lowerField.includes('amount') || 
                             lowerField.includes('balance') ||
                             lowerField.includes('total') ||
                             lowerField.includes('price') ||
                             lowerField.includes('cost') ||
                             lowerField.includes('payment') ||
                             lowerField.includes('fee');
      
      // Extract numeric value from string (handles: 39235, (39235), $39,235, etc.)
      const numericMatch = valueStr.match(/[\s$,()]*([0-9]+(?:\.[0-9]{1,2})?)[\s$,()]*/);
      
      if (numericMatch && numericMatch[1] && (looksLikeNumber || isCurrencyField)) {
        const numValue = parseFloat(numericMatch[1]);
        if (!isNaN(numValue) && numValue >= 0) {
          return '$' + numValue.toLocaleString('en-US', { 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 0 
          });
        }
      }
      
      return valueStr;
    };
    
    // Replace custom fields with double braces {{field}} first
    const doubleBracePattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    result = result.replace(doubleBracePattern, (match, fieldName) => {
      // Try exact field name
      if (recipient[fieldName] !== undefined) {
        return formatCurrencyValue(recipient[fieldName], fieldName);
      }
      // Try lowercase
      const lowerField = fieldName.toLowerCase();
      if (recipient[lowerField] !== undefined) {
        return formatCurrencyValue(recipient[lowerField], fieldName);
      }
      // Try camelCase conversion (e.g., Total_Debt_Amount -> totalDebtAmount)
      const camelCase = fieldName.replace(/_([a-z])/gi, (g: string) => g[1].toUpperCase());
      if (recipient[camelCase] !== undefined) {
        return formatCurrencyValue(recipient[camelCase], fieldName);
      }
      // Try snake_case conversion
      const snakeCase = fieldName.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
      if (recipient[snakeCase] !== undefined) {
        return formatCurrencyValue(recipient[snakeCase], fieldName);
      }
      return match;
    });
    
    // Replace custom fields with single braces {field} or ${field}
    const customFieldPattern = /\$?\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    result = result.replace(customFieldPattern, (match, fieldName) => {
      // Try snake_case field name
      if (recipient[fieldName] !== undefined) {
        return formatCurrencyValue(recipient[fieldName], fieldName);
      }
      // Try camelCase conversion (e.g., dollar_amount -> dollarAmount)
      const camelCase = fieldName.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
      if (recipient[camelCase] !== undefined) {
        return formatCurrencyValue(recipient[camelCase], fieldName);
      }
      // Return original if not found
      return match;
    });
    
    return result;
  }

  private async sendViaTwilio(
    client: Twilio.Twilio,
    from: string,
    to: string,
    body: string
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      // Add timeout to prevent hanging - 30 second timeout
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Twilio API timeout (30s)')), 30000)
      );
      
      const messagePromise = client.messages.create({
        from,
        to,
        body,
      });
      
      const message = await Promise.race([messagePromise, timeoutPromise]);
      return { success: true, messageSid: message.sid };
    } catch (error: any) {
      return { success: false, error: error.message || 'Twilio send failed' };
    }
  }

  private async sendViaCommio(
    apiKey: string,
    apiSecret: string,
    from: string,
    to: string,
    body: string,
    accountId?: string
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      // ThinQ/Commio API: https://api.thinq.com/account/{account_id}/product/origination/sms/send
      // URL uses accountId (numeric like "22956"), Auth uses apiKey:apiSecret (username:token)
      const thinqAccountId = accountId || apiKey;
      const url = `https://api.thinq.com/account/${thinqAccountId}/product/origination/sms/send`;
      
      // Add AbortController for 30-second timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      console.log(`[BatchSMS] Commio request: URL account=${thinqAccountId}, auth user=${apiKey}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          from_did: from.replace(/[^\d]/g, ''), // Remove all non-digits for ThinQ
          to_did: to.replace(/[^\d]/g, ''),
          message: body,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`[BatchSMS] Commio response: ${response.status} - ${responseText.substring(0, 200)}`);
      
      if (response.ok) {
        try {
          const data = JSON.parse(responseText);
          return { success: true, messageSid: data.guid || data.id || `commio_${Date.now()}` };
        } catch {
          return { success: true, messageSid: `commio_${Date.now()}` };
        }
      } else {
        return { success: false, error: `Commio error (${response.status}): ${responseText}` };
      }
    } catch (error: any) {
      // Handle abort/timeout specifically
      if (error.name === 'AbortError') {
        return { success: false, error: 'Commio API timeout (30s)' };
      }
      return { success: false, error: error.message || 'Commio send failed' };
    }
  }

  // Start batch job asynchronously and return immediately with job ID
  async startBatchAsync(options: BatchSendOptions): Promise<{ jobId: string; total: number }> {
    // CRITICAL: Check if a batch job is already running for this campaign to prevent duplicate sends
    if (options.campaignId) {
      const existingJob = this.getCampaignProgress(options.campaignId);
      if (existingJob) {
        console.log(`[BatchSMS] ⚠️ Campaign ${options.campaignId} already has an active batch job (${existingJob.jobId}), skipping duplicate start`);
        return { jobId: existingJob.jobId, total: existingJob.total };
      }
    }
    
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Load baseline counts from DB (for resume: existing sent/failed before this batch)
    let baselineSent = 0;
    let baselineFailed = 0;
    if (options.campaignId) {
      try {
        const [camp] = await db.select({ sentCount: smsCampaigns.sentCount, failedCount: smsCampaigns.failedCount })
          .from(smsCampaigns).where(eq(smsCampaigns.id, options.campaignId));
        baselineSent = camp?.sentCount || 0;
        baselineFailed = camp?.failedCount || 0;
        if (baselineSent > 0 || baselineFailed > 0) {
          console.log(`[BatchSMS] Resume baseline: sent=${baselineSent}, failed=${baselineFailed}`);
        }
      } catch { /* ignore */ }
    }

    const progress: BatchProgress & { campaignId?: number; startTime: number } = {
      total: options.recipients.length,
      sent: 0,
      failed: 0,
      inProgress: 0,
      byNumber: {},
      campaignId: options.campaignId,
      startTime: Date.now(),
    };
    
    // Initialize progress tracking per number
    options.phoneNumbers.forEach(pn => {
      progress.byNumber[pn.phoneNumber] = { sent: 0, failed: 0, pending: 0 };
    });
    
    activeBatchJobs.set(jobId, progress);
    
    // Track last DB update time for periodic persistence
    let lastDbUpdateTime = Date.now();
    let lastDbUpdateCount = 0;
    const DB_UPDATE_INTERVAL_MS = 10000; // Update DB every 10 seconds
    const DB_UPDATE_MESSAGE_COUNT = 100; // Or every 100 messages
    
    // Start sending in background (don't await)
    this.sendBatch({ ...options, onProgress: async (p) => {
      // Update the stored progress (in-memory)
      const stored = activeBatchJobs.get(jobId);
      if (stored) {
        stored.sent = p.sent;
        stored.failed = p.failed;
        stored.inProgress = p.inProgress;
        stored.byNumber = p.byNumber;
        stored.estimatedCompletionTime = p.estimatedCompletionTime;
        stored.currentRate = p.currentRate;
      }
      
      // Periodically update database for cross-server visibility
      // Use baseline + current batch counts so resume doesn't lose previous progress
      const now = Date.now();
      const messagesSinceLastUpdate = (p.sent + p.failed) - lastDbUpdateCount;
      const timeSinceLastUpdate = now - lastDbUpdateTime;
      
      if (options.campaignId && (messagesSinceLastUpdate >= DB_UPDATE_MESSAGE_COUNT || timeSinceLastUpdate >= DB_UPDATE_INTERVAL_MS)) {
        lastDbUpdateTime = now;
        lastDbUpdateCount = p.sent + p.failed;
        
        try {
          // Get actual counts from campaign_recipients to avoid double-counting
          const [sentCountResult] = await db.select({ count: sql<number>`count(*)` })
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.smsCampaignId, options.campaignId), eq(campaignRecipients.status, 'sent')));
          const [failedCountResult] = await db.select({ count: sql<number>`count(*)` })
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.smsCampaignId, options.campaignId), eq(campaignRecipients.status, 'failed')));
          
          const actualSent = Number(sentCountResult?.count || 0);
          const actualFailed = Number(failedCountResult?.count || 0);
          
          await db.update(smsCampaigns)
            .set({
              sentCount: actualSent,
              failedCount: actualFailed,
              updatedAt: new Date(),
            })
            .where(eq(smsCampaigns.id, options.campaignId));
        } catch (err) {
          // Don't fail the batch on DB update errors
          console.error('[BatchSMS] Periodic DB update failed:', err);
        }
      }
    }}).then(async (result) => {
      // Update campaign status when complete
      if (options.campaignId) {
        try {
          // CRITICAL: Get actual counts from campaign_recipients table to avoid double-counting on resume
          const [sentCountResult] = await db.select({ count: sql<number>`count(*)` })
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.smsCampaignId, options.campaignId), eq(campaignRecipients.status, 'sent')));
          const [failedCountResult] = await db.select({ count: sql<number>`count(*)` })
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.smsCampaignId, options.campaignId), eq(campaignRecipients.status, 'failed')));
          const [pendingCountResult] = await db.select({ count: sql<number>`count(*)` })
            .from(campaignRecipients)
            .where(and(eq(campaignRecipients.smsCampaignId, options.campaignId), eq(campaignRecipients.status, 'pending')));
          
          const actualSent = Number(sentCountResult?.count || 0);
          const actualFailed = Number(failedCountResult?.count || 0);
          const actualPending = Number(pendingCountResult?.count || 0);
          
          // Determine if fully complete (no pending recipients left)
          const isFullyComplete = actualPending === 0;
          
          // Update with actual counts from recipient table
          await db.update(smsCampaigns)
            .set({
              status: isFullyComplete ? 'completed' : 'paused',
              sentCount: actualSent,
              failedCount: actualFailed,
              completedAt: isFullyComplete ? new Date() : undefined,
            })
            .where(eq(smsCampaigns.id, options.campaignId));
          console.log(`[BatchSMS] Campaign ${options.campaignId} ${isFullyComplete ? 'COMPLETED' : 'PAUSED'}: ${actualSent} sent, ${actualFailed} failed, ${actualPending} pending (this batch: +${result.sent}/+${result.failed})`);

          // After 30s, recount delivered messages from DB (webhooks may have updated statuses)
          const campaignId = options.campaignId;
          setTimeout(async () => {
            try {
              const deliveredResult = await db
                .select({ count: sql<number>`count(*)` })
                .from(smsMessages)
                .where(and(
                  eq(smsMessages.campaignId, campaignId),
                  eq(smsMessages.status, 'delivered')
                ));
              const deliveredCount = Number(deliveredResult[0]?.count || 0);
              
              // Also count 'sent' as delivered for providers that don't send delivery receipts
              const sentResult = await db
                .select({ count: sql<number>`count(*)` })
                .from(smsMessages)
                .where(and(
                  eq(smsMessages.campaignId, campaignId),
                  eq(smsMessages.status, 'sent')
                ));
              const sentAsDelivered = Number(sentResult[0]?.count || 0);
              const totalDelivered = deliveredCount + sentAsDelivered;

              if (totalDelivered > 0) {
                await db.update(smsCampaigns)
                  .set({ deliveredCount: totalDelivered })
                  .where(eq(smsCampaigns.id, campaignId));
                console.log(`[BatchSMS] Campaign ${campaignId} delivered count updated: ${totalDelivered} (${deliveredCount} delivered + ${sentAsDelivered} sent)`);
              }
            } catch (err) {
              console.error('[BatchSMS] Failed to recount delivered:', err);
            }
          }, 30000);
        } catch (err) {
          console.error('[BatchSMS] Failed to update campaign status:', err);
        }
      }
      // Clean up job after 5 minutes
      setTimeout(() => activeBatchJobs.delete(jobId), 5 * 60 * 1000);
    }).catch(async (err) => {
      console.error('[BatchSMS] Batch job error caught:', err);
      console.error('[BatchSMS] Error stack:', err.stack);
      
      // Get current progress to see how far we got
      const currentProgress = activeBatchJobs.get(jobId);
      const sentSoFar = baselineSent + (currentProgress?.sent || 0);
      const failedSoFar = baselineFailed + (currentProgress?.failed || 0);
      const totalProcessed = sentSoFar + failedSoFar;
      const totalCampaignRecipients = options.totalCampaignRecipients || options.recipients.length;
      
      console.error(`[BatchSMS] Progress at error: sent=${sentSoFar}, failed=${failedSoFar}, total processed=${totalProcessed}/${totalCampaignRecipients}`);
      
      // Save progress and mark as completed - don't auto-pause on errors
      if (options.campaignId) {
        try {
          await db.update(smsCampaigns)
            .set({ 
              status: 'completed',
              sentCount: sentSoFar,
              failedCount: failedSoFar,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(smsCampaigns.id, options.campaignId));
          console.log(`[BatchSMS] Campaign ${options.campaignId} PAUSED due to error: ${sentSoFar} sent, ${failedSoFar} failed - click Play to resume`);
        } catch (dbErr) {
          console.error('[BatchSMS] Failed to update campaign status on error:', dbErr);
        }
      }
      
      // Clean up on error
      setTimeout(() => activeBatchJobs.delete(jobId), 60 * 1000);
    });
    
    return { jobId, total: options.recipients.length };
  }

  async sendBatch(options: BatchSendOptions): Promise<BatchResult> {
    const {
      recipients,
      message,
      phoneNumbers,
      campaignId,
      userId,
      messagesPerNumber = 2000,
      concurrentPerNumber = 10,
      onProgress,
      dripMode = false,
      messagesPerMinute = 30, // Safe default: 30 msgs/min = 1 msg every 2 seconds
      startTime: scheduledStartTime,
      spreadOverHours,
    } = options;

    const startTime = Date.now();
    const errors: Array<{ phone: string; error: string }> = [];
    
    const progress: BatchProgress = {
      total: recipients.length,
      sent: 0,
      failed: 0,
      inProgress: 0,
      byNumber: {},
    };

    // Initialize progress tracking per number
    phoneNumbers.forEach(pn => {
      progress.byNumber[pn.phoneNumber] = { sent: 0, failed: 0, pending: 0 };
    });

    // Distribute recipients across phone numbers
    // CRITICAL: Use assigned sender number if already set (for resume), otherwise assign one
    const numberQueues: Map<string, BatchRecipient[]> = new Map();
    phoneNumbers.forEach(pn => numberQueues.set(pn.phoneNumber, []));
    
    // Build a map of phone number strings to configs for quick lookup
    const phoneConfigMap: Map<string, PhoneNumberConfig> = new Map();
    phoneNumbers.forEach(pn => phoneConfigMap.set(pn.phoneNumber, pn));

    // Track recipients that need their assigned number updated in DB
    const recipientsToAssign: Array<{ phone: string; assignedNumber: string }> = [];

    // Round-robin distribution with messagesPerNumber limit
    // BUT: if recipient already has an assigned sender, use that instead
    let numberIndex = 0;
    for (const recipient of recipients) {
      // Check if this recipient already has an assigned sender number
      if (recipient.assignedFromNumber && phoneConfigMap.has(recipient.assignedFromNumber)) {
        // Use the previously assigned sender
        const queue = numberQueues.get(recipient.assignedFromNumber)!;
        queue.push(recipient);
        progress.byNumber[recipient.assignedFromNumber].pending++;
      } else {
        // Assign a new sender number using round-robin
        const phoneNumber = phoneNumbers[numberIndex % phoneNumbers.length];
        const queue = numberQueues.get(phoneNumber.phoneNumber)!;
        
        // Check if this number has reached its limit
        if (queue.length < messagesPerNumber) {
          queue.push(recipient);
          progress.byNumber[phoneNumber.phoneNumber].pending++;
          // Track for DB update
          recipientsToAssign.push({ phone: recipient.phone, assignedNumber: phoneNumber.phoneNumber });
        } else {
          // Find next available number
          let found = false;
          for (let i = 0; i < phoneNumbers.length; i++) {
            const nextNumber = phoneNumbers[(numberIndex + i) % phoneNumbers.length];
            const nextQueue = numberQueues.get(nextNumber.phoneNumber)!;
            if (nextQueue.length < messagesPerNumber) {
              nextQueue.push(recipient);
              progress.byNumber[nextNumber.phoneNumber].pending++;
              recipientsToAssign.push({ phone: recipient.phone, assignedNumber: nextNumber.phoneNumber });
              found = true;
              break;
            }
          }
          if (!found) {
            // All numbers at capacity, add to first number anyway
            queue.push(recipient);
            progress.byNumber[phoneNumber.phoneNumber].pending++;
            recipientsToAssign.push({ phone: recipient.phone, assignedNumber: phoneNumber.phoneNumber });
          }
        }
        numberIndex++;
      }
    }
    
    // Update assigned sender numbers in DB (batch update for performance)
    if (campaignId && recipientsToAssign.length > 0) {
      console.log(`[BatchSMS] Assigning sender numbers to ${recipientsToAssign.length} recipients...`);
      try {
        // Batch update in chunks of 500
        for (let i = 0; i < recipientsToAssign.length; i += 500) {
          const chunk = recipientsToAssign.slice(i, i + 500);
          for (const { phone, assignedNumber } of chunk) {
            await db.update(campaignRecipients)
              .set({ assignedFromNumber: assignedNumber })
              .where(and(
                eq(campaignRecipients.smsCampaignId, campaignId),
                eq(campaignRecipients.phoneNumber, phone)
              ));
          }
        }
        console.log(`[BatchSMS] Assigned sender numbers to ${recipientsToAssign.length} recipients`);
      } catch (assignErr) {
        console.error(`[BatchSMS] Error assigning sender numbers:`, assignErr);
      }
    }

    console.log(`[BatchSMS] Starting batch send: ${recipients.length} recipients across ${phoneNumbers.length} numbers, dripMode=${dripMode}, rate=${messagesPerMinute} msgs/min`);
    phoneNumbers.forEach(pn => {
      const queue = numberQueues.get(pn.phoneNumber)!;
      console.log(`[BatchSMS] ${pn.phoneNumber} (${pn.provider}): ${queue.length} messages`);
    });

    // Batch recipient status updates for campaign_recipients (enables pause/resume)
    const recipientStatusBatch: Array<{ phone: string; status: string; messageSid: string | null; error: string | null }> = [];

    // Track which recipients have been sent in this batch to prevent duplicates
    const sentInThisBatch: Set<string> = new Set();
    
    // Helper: send a single message via the correct provider
    const sendMessage = async (recipient: BatchRecipient, phoneConfig: PhoneNumberConfig): Promise<void> => {
      // CRITICAL SAFEGUARD 1: If recipient has an assigned sender that differs from current sender, SKIP
      // This prevents the same recipient from receiving messages from multiple senders
      if (recipient.assignedFromNumber && recipient.assignedFromNumber !== phoneConfig.phoneNumber) {
        console.log(`[BatchSMS] ⚠️ SKIPPING ${recipient.phone} - assigned to ${recipient.assignedFromNumber} but trying to send from ${phoneConfig.phoneNumber}`);
        progress.failed++;
        progress.byNumber[phoneConfig.phoneNumber].failed++;
        progress.byNumber[phoneConfig.phoneNumber].pending--;
        errors.push({ phone: recipient.phone, error: 'Sender mismatch - recipient assigned to different number' });
        return;
      }
      
      // CRITICAL SAFEGUARD 2: If recipient already sent in this batch, SKIP (prevents duplicates)
      if (sentInThisBatch.has(recipient.phone)) {
        console.log(`[BatchSMS] ⚠️ SKIPPING ${recipient.phone} - already sent in this batch`);
        progress.byNumber[phoneConfig.phoneNumber].pending--;
        return;
      }
      sentInThisBatch.add(recipient.phone);
      
      // CRITICAL SAFEGUARD 3: Check DB if recipient was already sent in a previous batch (extra safety for resume)
      if (campaignId) {
        try {
          const [existing] = await db.select({ status: campaignRecipients.status })
            .from(campaignRecipients)
            .where(and(
              eq(campaignRecipients.smsCampaignId, campaignId),
              eq(campaignRecipients.phoneNumber, recipient.phone)
            ));
          if (existing && (existing.status === 'sent' || existing.status === 'delivered')) {
            console.log(`[BatchSMS] ⚠️ SKIPPING ${recipient.phone} - already sent in previous batch (status: ${existing.status})`);
            progress.byNumber[phoneConfig.phoneNumber].pending--;
            return;
          }
        } catch (checkErr) {
          // Continue if check fails - other safeguards will catch duplicates
        }
      }
      
      const personalizedMessage = this.applyMergeTags(message, recipient);
      let result: { success: boolean; messageSid?: string; error?: string };

      if (phoneConfig.provider === 'twilio' && phoneConfig.accountSid && phoneConfig.authToken) {
        const client = this.getTwilioClient(phoneConfig.accountSid, phoneConfig.authToken);
        result = await this.sendViaTwilio(client, phoneConfig.phoneNumber, recipient.phone, personalizedMessage);
      } else if (phoneConfig.provider === 'commio' && phoneConfig.apiKey && phoneConfig.apiSecret) {
        result = await this.sendViaCommio(phoneConfig.apiKey, phoneConfig.apiSecret, phoneConfig.phoneNumber, recipient.phone, personalizedMessage, phoneConfig.commioAccountId);
      } else {
        console.log(`[BatchSMS] Invalid config for ${phoneConfig.phoneNumber}: provider=${phoneConfig.provider}, hasSid=${!!phoneConfig.accountSid}, hasToken=${!!phoneConfig.authToken}, hasApiKey=${!!phoneConfig.apiKey}`);
        result = { success: false, error: 'Invalid provider configuration' };
      }

      if (result.success) {
        progress.sent++;
        progress.byNumber[phoneConfig.phoneNumber].sent++;
      } else {
        progress.failed++;
        progress.byNumber[phoneConfig.phoneNumber].failed++;
        errors.push({ phone: recipient.phone, error: result.error || 'Unknown error' });
      }
      progress.byNumber[phoneConfig.phoneNumber].pending--;

      dbMessageBatch.push({
        userId,
        accountId: phoneConfig.accountId || null,
        providerCode: phoneConfig.provider || null,
        messageSid: result.messageSid || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: phoneConfig.phoneNumber,
        to: recipient.phone,
        body: personalizedMessage,
        status: result.success ? 'sent' : 'failed',
        direction: 'outbound-api',
        sentAt: new Date(),
        createdAt: new Date(),
        campaignId: campaignId || null,
      });

      // Track recipient status update for campaign_recipients table (enables pause/resume)
      if (campaignId) {
        recipientStatusBatch.push({
          phone: recipient.phone,
          status: result.success ? 'sent' : 'failed',
          messageSid: result.messageSid || null,
          error: result.error || null,
        });
      }

      if (onProgress) {
        onProgress({ ...progress });
      }
    };

    // Batch database inserts for better performance
    const dbMessageBatch: any[] = [];
    const flushDbBatch = async () => {
      if (dbMessageBatch.length > 0) {
        try {
          await db.insert(smsMessages).values(dbMessageBatch);
          dbMessageBatch.length = 0;
        } catch (dbError) {
          console.error('[BatchSMS] Batch DB insert error:', dbError);
        }
      }
    };

    const flushRecipientStatusBatch = async () => {
      if (recipientStatusBatch.length === 0 || !campaignId) return;
      const batch = recipientStatusBatch.splice(0);
      try {
        for (const r of batch) {
          await db.update(campaignRecipients)
            .set({
              status: r.status as any,
              messageSid: r.messageSid,
              sentAt: r.status === 'sent' ? new Date() : undefined,
              failedAt: r.status === 'failed' ? new Date() : undefined,
              errorMessage: r.error,
            })
            .where(and(
              eq(campaignRecipients.smsCampaignId, campaignId),
              eq(campaignRecipients.phoneNumber, r.phone),
              eq(campaignRecipients.status, 'pending')
            ));
        }
      } catch (err) {
        console.error('[BatchSMS] Recipient status update error:', err);
      }
    };

    if (dripMode) {
      // ===== GHL-STYLE DRIP MODE (Anti-Flagging) =====
      // Wrap entire drip mode in try-catch to prevent crashes
      try {
      //
      // How it works (matching GHL/industry best practices):
      //   1. messagesPerMinute = TOTAL campaign throughput across all numbers
      //   2. Per-number rate is capped: minimum 3 seconds between sends on the SAME number
      //      (max ~20 msgs/min per number) to avoid carrier flagging
      //   3. Round-robin across numbers so each number gets natural breathing room
      //   4. Random jitter (±500ms) on delays to avoid robotic patterns
      //   5. If user sets a rate higher than numbers can safely handle, we cap it
      //
      // Example: 500 msgs/min with 10 numbers → 50 msgs/min per number → 1.2s delay per number
      //          But minimum per-number delay is 3s, so effective = 20/num × 10 = 200 msgs/min max
      //          The system will send at 200 msgs/min (the safe max), not 500.

      const MIN_PER_NUMBER_DELAY_MS = 3000; // 3 seconds minimum between sends on same number
      const JITTER_MS = 500; // ±500ms random jitter to avoid robotic patterns
      const numNumbers = phoneNumbers.length;

      // Calculate per-number rate from total rate
      const requestedPerNumberRate = messagesPerMinute / numNumbers; // msgs/min per number
      const maxSafePerNumberRate = 60000 / MIN_PER_NUMBER_DELAY_MS; // ~20 msgs/min per number
      const effectivePerNumberRate = Math.min(requestedPerNumberRate, maxSafePerNumberRate);
      const effectiveTotalRate = Math.round(effectivePerNumberRate * numNumbers);
      const perNumberDelayMs = 60000 / effectivePerNumberRate; // actual delay per number

      if (effectiveTotalRate < messagesPerMinute) {
        console.log(`[BatchSMS] Drip mode: Requested ${messagesPerMinute} msgs/min but capping at ${effectiveTotalRate} msgs/min (safe limit: ${maxSafePerNumberRate} msgs/min per number × ${numNumbers} numbers)`);
      }
      console.log(`[BatchSMS] Drip mode: ${effectiveTotalRate} effective msgs/min, ${perNumberDelayMs.toFixed(0)}ms per-number delay, ${numNumbers} numbers`);

      // Track last send time per number for precise per-number throttling
      const lastSendTime: Map<string, number> = new Map();
      phoneNumbers.forEach(pn => lastSendTime.set(pn.phoneNumber, 0));

      // Flatten all recipients into round-robin order across numbers
      const allMessages: Array<{ recipient: BatchRecipient; phoneConfig: PhoneNumberConfig }> = [];
      const queuesArray = phoneNumbers.map(pn => ({
        config: pn,
        queue: numberQueues.get(pn.phoneNumber)!,
        index: 0,
      }));

      let hasRemaining = true;
      while (hasRemaining) {
        hasRemaining = false;
        for (const q of queuesArray) {
          if (q.index < q.queue.length) {
            allMessages.push({ recipient: q.queue[q.index], phoneConfig: q.config });
            q.index++;
            if (q.index < q.queue.length) hasRemaining = true;
          }
        }
      }

      // Send sequentially with per-number delay enforcement
      for (let i = 0; i < allMessages.length; i++) {
        // Check if campaign is paused every 50 messages and log heartbeat every 100
        if (i % 100 === 0) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const rate = i > 0 ? Math.round((i / elapsed) * 60) : 0;
          console.log(`[BatchSMS] Heartbeat: ${i}/${allMessages.length} (${Math.round(i/allMessages.length*100)}%) - ${progress.sent} sent, ${progress.failed} failed - ${elapsed}s elapsed, ~${rate} msgs/min`);
        }
        
        // Check for pause every 50 messages to allow user to pause campaign
        if (campaignId && i % 50 === 0 && i > 0) {
          try {
            const [campaignStatus] = await db.select({ status: smsCampaigns.status })
              .from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
            
            if (campaignStatus?.status === 'paused') {
              console.log(`[BatchSMS] Campaign ${campaignId} PAUSED by user at message ${i}/${allMessages.length}`);
              // Flush remaining batches before stopping
              await flushDbBatch();
              await flushRecipientStatusBatch();
              // Update campaign counts (progress.sent/failed are from this batch only)
              await db.update(smsCampaigns)
                .set({ updatedAt: new Date() })
                .where(eq(smsCampaigns.id, campaignId));
              return { success: true, total: recipients.length, sent: progress.sent, failed: progress.failed, errors, duration: Date.now() - startTime };
            }
          } catch (statusErr) {
            // Ignore status check errors - continue sending
          }
        }

        const { recipient, phoneConfig } = allMessages[i];
        progress.inProgress = 1;

        // Estimated completion
        const remainingMessages = allMessages.length - i;
        const estimatedMinutes = remainingMessages / effectiveTotalRate;
        progress.estimatedCompletionTime = new Date(Date.now() + estimatedMinutes * 60000);
        progress.currentRate = effectiveTotalRate;

        // Enforce per-number delay: wait until enough time has passed since last send on this number
        const lastTime = lastSendTime.get(phoneConfig.phoneNumber) || 0;
        const elapsed = Date.now() - lastTime;
        const jitter = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS; // random ±500ms
        const requiredDelay = perNumberDelayMs + jitter;
        if (elapsed < requiredDelay && lastTime > 0) {
          await new Promise(resolve => setTimeout(resolve, requiredDelay - elapsed));
        }

        // Send the message with retry logic - never give up!
        lastSendTime.set(phoneConfig.phoneNumber, Date.now());
        let sendSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!sendSuccess && retryCount < maxRetries) {
          try {
            await sendMessage(recipient, phoneConfig);
            sendSuccess = true;
          } catch (sendErr: any) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`[BatchSMS] Retry ${retryCount}/${maxRetries} for ${recipient.phone}: ${sendErr.message}`);
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
            } else {
              console.error(`[BatchSMS] Failed after ${maxRetries} retries for ${recipient.phone}:`, sendErr.message);
              progress.failed++;
              progress.byNumber[phoneConfig.phoneNumber].failed++;
              progress.byNumber[phoneConfig.phoneNumber].pending--;
              errors.push({ phone: recipient.phone, error: sendErr.message || 'Send failed after retries' });
            }
          }
        }
        progress.inProgress = 0;

        // Flush DB batch every 100 messages
        if (dbMessageBatch.length >= 100) {
          await flushDbBatch();
          await flushRecipientStatusBatch();
        }
      }

      await flushDbBatch();
      await flushRecipientStatusBatch();
      } catch (dripErr: any) {
        console.error(`[BatchSMS] Drip mode error (continuing to completion):`, dripErr.message);
        // Flush any remaining batches
        await flushDbBatch();
        await flushRecipientStatusBatch();
      }
    } else {
      // ===== NORMAL PARALLEL MODE =====
      // Process each number's queue in parallel with concurrency limit
      // Wrap in try-catch to prevent crashes
      try {
      
      const numberPromises = phoneNumbers.map(async (phoneConfig) => {
        const queue = numberQueues.get(phoneConfig.phoneNumber)!;
        if (queue.length === 0) return;

        for (let i = 0; i < queue.length; i += concurrentPerNumber) {
          // Check for pause every batch to allow user to pause campaign
          if (campaignId && i > 0) {
            try {
              const [campaignStatus] = await db.select({ status: smsCampaigns.status })
                .from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
              
              if (campaignStatus?.status === 'paused') {
                console.log(`[BatchSMS] Campaign ${campaignId} PAUSED by user in parallel mode`);
                return; // Exit this number's queue
              }
            } catch (statusErr) {
              // Ignore status check errors - continue sending
            }
          }
          
          const batch = queue.slice(i, i + concurrentPerNumber);
          progress.inProgress += batch.length;

          await Promise.all(batch.map(async (r) => {
            // Retry logic for parallel mode
            let sendSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!sendSuccess && retryCount < maxRetries) {
              try {
                await sendMessage(r, phoneConfig);
                sendSuccess = true;
              } catch (sendErr: any) {
                retryCount++;
                if (retryCount < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
                } else {
                  console.error(`[BatchSMS] Parallel mode failed after ${maxRetries} retries for ${r.phone}:`, sendErr.message);
                  progress.failed++;
                  progress.byNumber[phoneConfig.phoneNumber].failed++;
                  progress.byNumber[phoneConfig.phoneNumber].pending--;
                  errors.push({ phone: r.phone, error: sendErr.message || 'Send failed' });
                }
              }
            }
          }));
          progress.inProgress -= batch.length;

          // Flush DB batch every 100 messages
          if (dbMessageBatch.length >= 100) {
            await flushDbBatch();
            await flushRecipientStatusBatch();
          }

          // Small delay between batches to avoid overwhelming
          if (i + concurrentPerNumber < queue.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        await flushDbBatch();
        await flushRecipientStatusBatch();
      });

      await Promise.all(numberPromises);
      
      // Campaign always runs to completion - no early return
      } catch (parallelErr: any) {
        console.error(`[BatchSMS] Parallel mode error (continuing to completion):`, parallelErr.message);
        // Flush any remaining batches
        await flushDbBatch();
        await flushRecipientStatusBatch();
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[BatchSMS] Completed: ${progress.sent} sent, ${progress.failed} failed in ${duration}ms`);

    return {
      success: progress.failed === 0,
      total: recipients.length,
      sent: progress.sent,
      failed: progress.failed,
      errors,
      duration,
    };
  }

  // Get phone number configs from accounts
  async getPhoneNumberConfigs(phoneNumbers: string[]): Promise<PhoneNumberConfig[]> {
    // This would typically fetch from database/accounts
    // For now, return a structure that can be populated by the caller
    return phoneNumbers.map(pn => ({
      phoneNumber: pn,
      provider: 'twilio' as const,
    }));
  }
}

export const batchSmsService = new BatchSmsService();
export type { BatchSendOptions, BatchResult, BatchProgress, PhoneNumberConfig, BatchRecipient };
