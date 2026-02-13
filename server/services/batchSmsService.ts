import { db } from '../db';
import { smsMessages, smsCampaigns } from '@shared/schema';
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
    
    // Replace custom fields (e.g., {dollar_amount}, ${dollar_amount}, {custom_field})
    // Match any {field_name}, ${field_name}, or {{fieldName}} pattern
    const customFieldPattern = /\$?\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    result = result.replace(customFieldPattern, (match, fieldName) => {
      // Try snake_case field name
      if (recipient[fieldName] !== undefined) {
        return String(recipient[fieldName]);
      }
      // Try camelCase conversion (e.g., dollar_amount -> dollarAmount)
      const camelCase = fieldName.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
      if (recipient[camelCase] !== undefined) {
        return String(recipient[camelCase]);
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
      const message = await client.messages.create({
        from,
        to,
        body,
      });
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
      });

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
      return { success: false, error: error.message || 'Commio send failed' };
    }
  }

  // Start batch job asynchronously and return immediately with job ID
  async startBatchAsync(options: BatchSendOptions): Promise<{ jobId: string; total: number }> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
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
    
    // Start sending in background (don't await)
    this.sendBatch({ ...options, onProgress: (p) => {
      // Update the stored progress
      const stored = activeBatchJobs.get(jobId);
      if (stored) {
        stored.sent = p.sent;
        stored.failed = p.failed;
        stored.inProgress = p.inProgress;
        stored.byNumber = p.byNumber;
        stored.estimatedCompletionTime = p.estimatedCompletionTime;
        stored.currentRate = p.currentRate;
      }
    }}).then(async (result) => {
      // Update campaign status when complete
      if (options.campaignId) {
        try {
          await db.update(smsCampaigns)
            .set({
              status: 'completed',
              sentCount: result.sent,
              failedCount: result.failed,
            })
            .where(eq(smsCampaigns.id, options.campaignId));
          console.log(`[BatchSMS] Campaign ${options.campaignId} completed: ${result.sent} sent, ${result.failed} failed`);

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
    }).catch(err => {
      console.error('[BatchSMS] Batch job failed:', err);
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
    const numberQueues: Map<string, BatchRecipient[]> = new Map();
    phoneNumbers.forEach(pn => numberQueues.set(pn.phoneNumber, []));

    // Round-robin distribution with messagesPerNumber limit
    let numberIndex = 0;
    for (const recipient of recipients) {
      const phoneNumber = phoneNumbers[numberIndex % phoneNumbers.length];
      const queue = numberQueues.get(phoneNumber.phoneNumber)!;
      
      // Check if this number has reached its limit
      if (queue.length < messagesPerNumber) {
        queue.push(recipient);
        progress.byNumber[phoneNumber.phoneNumber].pending++;
      } else {
        // Find next available number
        let found = false;
        for (let i = 0; i < phoneNumbers.length; i++) {
          const nextNumber = phoneNumbers[(numberIndex + i) % phoneNumbers.length];
          const nextQueue = numberQueues.get(nextNumber.phoneNumber)!;
          if (nextQueue.length < messagesPerNumber) {
            nextQueue.push(recipient);
            progress.byNumber[nextNumber.phoneNumber].pending++;
            found = true;
            break;
          }
        }
        if (!found) {
          // All numbers at capacity, add to first number anyway
          queue.push(recipient);
          progress.byNumber[phoneNumber.phoneNumber].pending++;
        }
      }
      numberIndex++;
    }

    console.log(`[BatchSMS] Starting batch send: ${recipients.length} recipients across ${phoneNumbers.length} numbers, dripMode=${dripMode}, rate=${messagesPerMinute} msgs/min`);
    phoneNumbers.forEach(pn => {
      const queue = numberQueues.get(pn.phoneNumber)!;
      console.log(`[BatchSMS] ${pn.phoneNumber} (${pn.provider}): ${queue.length} messages`);
    });

    // Helper: send a single message via the correct provider
    const sendMessage = async (recipient: BatchRecipient, phoneConfig: PhoneNumberConfig): Promise<void> => {
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

    if (dripMode) {
      // ===== GHL-STYLE DRIP MODE (Anti-Flagging) =====
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

        // Send the message
        lastSendTime.set(phoneConfig.phoneNumber, Date.now());
        await sendMessage(recipient, phoneConfig);
        progress.inProgress = 0;

        // Flush DB batch every 100 messages
        if (dbMessageBatch.length >= 100) {
          await flushDbBatch();
        }
      }

      await flushDbBatch();
    } else {
      // ===== NORMAL PARALLEL MODE =====
      // Process each number's queue in parallel with concurrency limit
      const numberPromises = phoneNumbers.map(async (phoneConfig) => {
        const queue = numberQueues.get(phoneConfig.phoneNumber)!;
        if (queue.length === 0) return;

        for (let i = 0; i < queue.length; i += concurrentPerNumber) {
          const batch = queue.slice(i, i + concurrentPerNumber);
          progress.inProgress += batch.length;

          await Promise.all(batch.map(r => sendMessage(r, phoneConfig)));
          progress.inProgress -= batch.length;

          // Flush DB batch every 100 messages
          if (dbMessageBatch.length >= 100) {
            await flushDbBatch();
          }

          // Small delay between batches to avoid overwhelming
          if (i + concurrentPerNumber < queue.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }

        await flushDbBatch();
      });

      await Promise.all(numberPromises);
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
