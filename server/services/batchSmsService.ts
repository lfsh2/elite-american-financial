import { db } from '../db';
import { smsMessages } from '@shared/schema';
import Twilio from 'twilio';

interface BatchRecipient {
  phone: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

interface PhoneNumberConfig {
  phoneNumber: string;
  provider: 'twilio' | 'commio';
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
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

class BatchSmsService {
  private twilioClients: Map<string, Twilio.Twilio> = new Map();

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
    
    result = result.replace(/\{\{firstName\}\}/gi, firstName);
    result = result.replace(/\{\{lastName\}\}/gi, lastName);
    result = result.replace(/\{\{phone\}\}/gi, recipient.phone);
    result = result.replace(/\{\{name\}\}/gi, recipient.name || firstName);
    
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
    body: string
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      const response = await fetch('https://api.commio.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          from,
          to,
          text: body,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, messageSid: data.id || data.message_id };
      } else {
        const errorData = await response.text();
        return { success: false, error: `Commio error: ${errorData}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Commio send failed' };
    }
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
          result = await this.sendViaCommio(phoneConfig.apiKey, phoneConfig.apiSecret, phoneConfig.phoneNumber, recipient.phone, personalizedMessage);
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

        // Store in database
        try {
          await db.insert(smsMessages).values({
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
        } catch (dbError) {
          console.error('[BatchSMS] DB insert error:', dbError);
        }

        // Report progress
        if (onProgress) {
          onProgress({ ...progress });
        }
      };

      // Calculate delay between messages based on rate limit
      const delayBetweenMessages = dripMode ? (60000 / messagesPerMinute) : 50; // ms
      
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
