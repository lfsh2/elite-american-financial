import { db } from '../db';
import { smsMessages, smsCampaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';
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

    console.log(`[BatchSMS] Starting batch send: ${recipients.length} recipients across ${phoneNumbers.length} numbers`);
    phoneNumbers.forEach(pn => {
      const queue = numberQueues.get(pn.phoneNumber)!;
      console.log(`[BatchSMS] ${pn.phoneNumber} (${pn.provider}): ${queue.length} messages`);
    });

    // Process each number's queue in parallel
    const numberPromises = phoneNumbers.map(async (phoneConfig) => {
      const queue = numberQueues.get(phoneConfig.phoneNumber)!;
      if (queue.length === 0) return;

      // Create worker pool for this number
      const sendMessage = async (recipient: BatchRecipient): Promise<void> => {
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

        // Update progress
        if (result.success) {
          progress.sent++;
          progress.byNumber[phoneConfig.phoneNumber].sent++;
        } else {
          progress.failed++;
          progress.byNumber[phoneConfig.phoneNumber].failed++;
          errors.push({ phone: recipient.phone, error: result.error || 'Unknown error' });
        }
        progress.byNumber[phoneConfig.phoneNumber].pending--;

        // Add to database batch (will be inserted in batches of 100)
        dbMessageBatch.push({
          userId,
          messageSid: result.messageSid || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          from: phoneConfig.phoneNumber,
          to: recipient.phone,
          body: personalizedMessage,
          status: result.success ? 'sent' : 'failed',
          direction: 'outbound-api',
          sentAt: new Date(),
          createdAt: new Date(),
        });

        // Report progress
        if (onProgress) {
          onProgress({ ...progress });
        }
      };

      // Calculate delay between messages based on rate limit
      const delayBetweenMessages = dripMode ? (60000 / messagesPerMinute) : 50; // ms
      
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

      // Process queue with concurrency limit and rate limiting
      const processBatch = async (batch: BatchRecipient[]): Promise<void> => {
        if (dripMode) {
          // In drip mode, send messages sequentially with delay
          for (const recipient of batch) {
            await sendMessage(recipient);
            if (batch.indexOf(recipient) < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
            }
          }
        } else {
          // Normal mode: parallel sending
          await Promise.all(batch.map(sendMessage));
        }
        
        // Flush DB batch every 100 messages
        if (dbMessageBatch.length >= 100) {
          await flushDbBatch();
        }
      };

      // Split queue into batches
      const batchSize = dripMode ? 1 : concurrentPerNumber; // In drip mode, process 1 at a time
      for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize);
        progress.inProgress += batch.length;
        
        // Calculate and report estimated completion time
        if (dripMode && onProgress) {
          const remainingMessages = queue.length - i;
          const estimatedMinutes = remainingMessages / messagesPerMinute;
          progress.estimatedCompletionTime = new Date(Date.now() + estimatedMinutes * 60000);
          progress.currentRate = messagesPerMinute;
        }
        
        await processBatch(batch);
        progress.inProgress -= batch.length;
        
        // Delay between batches
        if (i + batchSize < queue.length) {
          await new Promise(resolve => setTimeout(resolve, dripMode ? delayBetweenMessages : 50));
        }
      }
      
      // Flush any remaining messages in the batch
      await flushDbBatch();
    });

    // Wait for all numbers to complete
    await Promise.all(numberPromises);

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
