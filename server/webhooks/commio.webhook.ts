/**
 * Commio Webhook Handler
 * 
 * Handles incoming webhooks from Commio (ThinQ) for:
 * - Message delivery status updates
 * - Inbound messages
 * - Call status updates
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { smsMessages, voiceCalls, smsCampaigns } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { redisService } from '../services/redisService';

const router = Router();

interface CommioMessageWebhook {
  message_id: string;
  account_id: string;
  from: string;
  to: string;
  body?: string;
  status: string;
  direction: string;
  error_code?: string;
  error_message?: string;
  timestamp: string;
}

interface CommioCallWebhook {
  call_id: string;
  account_id: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  duration?: number;
  start_time?: string;
  end_time?: string;
}

/**
 * Message Status Callback
 * POST /api/webhooks/commio/message-status
 */
router.post('/message-status', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as CommioMessageWebhook;
    
    console.log(`[Commio Webhook] Message status update: ${webhook.message_id} -> ${webhook.status}`);

    // Find and update the message in database by provider message ID
    // Commio uses message_id, we store it in messageSid field
    const existingMessages = await db
      .select()
      .from(smsMessages)
      .where(eq(smsMessages.messageSid, webhook.message_id))
      .limit(1);

    if (existingMessages.length > 0) {
      const message = existingMessages[0];
      
      // Map Commio status to our status
      const mappedStatus = mapCommioMessageStatus(webhook.status);
      
      await db
        .update(smsMessages)
        .set({
          status: mappedStatus,
        })
        .where(eq(smsMessages.id, message.id));

      // If message was delivered, update campaign delivered count
      if (mappedStatus === 'delivered' && message.status !== 'delivered') {
        if (message.campaignId) {
          await db
            .update(smsCampaigns)
            .set({
              deliveredCount: sql`${smsCampaigns.deliveredCount} + 1`,
            })
            .where(eq(smsCampaigns.id, message.campaignId));
          console.log(`[Commio Webhook] Incremented delivered count for campaign ${message.campaignId}`);
        }
      }

      if (message.accountId) {
        await redisService.invalidateAccount(message.accountId);
      }

      console.log(`[Commio Webhook] Updated message ${webhook.message_id} status to ${mappedStatus}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Commio Webhook] Error processing message status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Inbound Message Handler
 * POST /api/webhooks/commio/inbound-message
 */
router.post('/inbound-message', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as CommioMessageWebhook;
    
    console.log(`[Commio Webhook] Inbound message from ${webhook.from} to ${webhook.to}`);

    const accountId = await findAccountByPhoneNumber(webhook.to);

    await db.insert(smsMessages).values({
      userId: 1,
      accountId: accountId,
      to: webhook.to,
      from: webhook.from,
      body: webhook.body || '',
      status: 'received',
      direction: 'inbound',
      sentAt: new Date(webhook.timestamp),
      messageSid: webhook.message_id,
    });

    if (accountId) {
      await redisService.invalidateAccount(accountId);
    }

    console.log(`[Commio Webhook] Stored inbound message ${webhook.message_id}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Commio Webhook] Error processing inbound message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Call Status Callback
 * POST /api/webhooks/commio/call-status
 */
router.post('/call-status', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as CommioCallWebhook;
    
    console.log(`[Commio Webhook] Call status update: ${webhook.call_id} -> ${webhook.status}`);

    const existingCalls = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.callSid, webhook.call_id))
      .limit(1);

    if (existingCalls.length > 0) {
      const call = existingCalls[0];
      
      const mappedStatus = mapCommioCallStatus(webhook.status);
      const updateData: any = {
        status: mappedStatus,
      };

      if (webhook.duration) {
        updateData.duration = webhook.duration;
      }

      if (webhook.end_time) {
        updateData.endTime = new Date(webhook.end_time);
      }

      await db
        .update(voiceCalls)
        .set(updateData)
        .where(eq(voiceCalls.id, call.id));

      if (call.accountId) {
        await redisService.invalidateAccount(call.accountId);
      }

      console.log(`[Commio Webhook] Updated call ${webhook.call_id} status to ${mappedStatus}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Commio Webhook] Error processing call status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Map Commio message status to our standard status
 */
function mapCommioMessageStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'queued': 'queued',
    'sending': 'sending',
    'sent': 'sent',
    'delivered': 'delivered',
    'failed': 'failed',
    'undelivered': 'undelivered',
    'received': 'received',
  };
  return statusMap[status.toLowerCase()] || status;
}

/**
 * Map Commio call status to our standard status
 */
function mapCommioCallStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'queued': 'queued',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'answered': 'in-progress',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'no-answer',
    'canceled': 'canceled',
  };
  return statusMap[status.toLowerCase()] || status;
}

/**
 * Helper function to find account by phone number
 */
async function findAccountByPhoneNumber(phoneNumber: string): Promise<number | null> {
  try {
    const { accountPhoneNumbers } = await import('../../shared/schema');
    
    const results = await db
      .select()
      .from(accountPhoneNumbers)
      .where(eq(accountPhoneNumbers.phoneNumber, phoneNumber))
      .limit(1);

    if (results.length > 0) {
      return results[0].accountId;
    }

    return null;
  } catch (error) {
    console.error('[Commio Webhook] Error finding account by phone number:', error);
    return null;
  }
}

export default router;
