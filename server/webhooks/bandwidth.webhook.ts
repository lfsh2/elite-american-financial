/**
 * Bandwidth Webhook Handler
 * 
 * Handles incoming webhooks from Bandwidth for:
 * - Message delivery status updates
 * - Inbound messages
 * - Call status updates
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { smsMessages, voiceCalls } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { redisService } from '../services/redisService';

const router = Router();

interface BandwidthMessageWebhook {
  type: string;
  time: string;
  description: string;
  to: string;
  message: {
    id: string;
    owner: string;
    applicationId: string;
    time: string;
    segmentCount: number;
    direction: string;
    to: string[];
    from: string;
    text: string;
    tag?: string;
    media?: string[];
  };
  errorCode?: number;
  description_?: string;
}

interface BandwidthCallWebhook {
  eventType: string;
  accountId: string;
  applicationId: string;
  callId: string;
  to: string;
  from: string;
  direction: string;
  state?: string;
  cause?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
}

/**
 * Message Callback (handles all message events)
 * POST /api/webhooks/bandwidth/message
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const webhooks = Array.isArray(req.body) ? req.body : [req.body];
    
    for (const webhook of webhooks as BandwidthMessageWebhook[]) {
      console.log(`[Bandwidth Webhook] Message event: ${webhook.type} for ${webhook.message?.id}`);

      if (!webhook.message) continue;

      const messageId = webhook.message.id;
      const status = mapBandwidthMessageStatus(webhook.type);

      if (webhook.type === 'message-received') {
        // Inbound message
        const accountId = await findAccountByPhoneNumber(webhook.message.to[0]);

        await db.insert(smsMessages).values({
          userId: 1,
          accountId: accountId,
          to: webhook.message.to[0],
          from: webhook.message.from,
          body: webhook.message.text || '',
          status: 'received',
          direction: 'inbound',
          sentAt: new Date(webhook.message.time),
          messageSid: messageId,
        });

        if (accountId) {
          await redisService.invalidateAccount(accountId);
        }

        console.log(`[Bandwidth Webhook] Stored inbound message ${messageId}`);
      } else {
        // Status update for outbound message
        const existingMessages = await db
          .select()
          .from(smsMessages)
          .where(eq(smsMessages.messageSid, messageId))
          .limit(1);

        if (existingMessages.length > 0) {
          const message = existingMessages[0];

          await db
            .update(smsMessages)
            .set({ status })
            .where(eq(smsMessages.id, message.id));

          if (message.accountId) {
            await redisService.invalidateAccount(message.accountId);
          }

          console.log(`[Bandwidth Webhook] Updated message ${messageId} status to ${status}`);
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Bandwidth Webhook] Error processing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Call Callback (handles all call events)
 * POST /api/webhooks/bandwidth/call
 */
router.post('/call', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as BandwidthCallWebhook;
    
    console.log(`[Bandwidth Webhook] Call event: ${webhook.eventType} for ${webhook.callId}`);

    const callId = webhook.callId;
    const status = mapBandwidthCallStatus(webhook.eventType, webhook.state);

    if (webhook.eventType === 'initiate' && webhook.direction === 'inbound') {
      // New inbound call
      const accountId = await findAccountByPhoneNumber(webhook.to);

      await db.insert(voiceCalls).values({
        userId: 1,
        accountId: accountId,
        to: webhook.to,
        from: webhook.from,
        status: 'ringing',
        direction: 'inbound',
        duration: 0,
        startTime: new Date(webhook.startTime || Date.now()),
        callSid: callId,
      });

      if (accountId) {
        await redisService.invalidateAccount(accountId);
      }

      console.log(`[Bandwidth Webhook] Stored inbound call ${callId}`);
    } else {
      // Status update for existing call
      const existingCalls = await db
        .select()
        .from(voiceCalls)
        .where(eq(voiceCalls.callSid, callId))
        .limit(1);

      if (existingCalls.length > 0) {
        const call = existingCalls[0];
        const updateData: any = { status };

        if (webhook.duration) {
          updateData.duration = parseInt(webhook.duration);
        }

        if (webhook.endTime) {
          updateData.endTime = new Date(webhook.endTime);
        }

        await db
          .update(voiceCalls)
          .set(updateData)
          .where(eq(voiceCalls.id, call.id));

        if (call.accountId) {
          await redisService.invalidateAccount(call.accountId);
        }

        console.log(`[Bandwidth Webhook] Updated call ${callId} status to ${status}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Bandwidth Webhook] Error processing call:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Map Bandwidth message event type to our standard status
 */
function mapBandwidthMessageStatus(eventType: string): string {
  const statusMap: Record<string, string> = {
    'message-sending': 'sending',
    'message-delivered': 'delivered',
    'message-failed': 'failed',
    'message-received': 'received',
  };
  return statusMap[eventType] || 'sent';
}

/**
 * Map Bandwidth call event to our standard status
 */
function mapBandwidthCallStatus(eventType: string, state?: string): string {
  if (state) {
    const stateMap: Record<string, string> = {
      'active': 'in-progress',
      'completed': 'completed',
    };
    if (stateMap[state]) return stateMap[state];
  }

  const eventMap: Record<string, string> = {
    'initiate': 'queued',
    'answer': 'in-progress',
    'hangup': 'completed',
    'disconnect': 'completed',
    'reject': 'failed',
    'timeout': 'no-answer',
  };
  return eventMap[eventType] || 'queued';
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
    console.error('[Bandwidth Webhook] Error finding account by phone number:', error);
    return null;
  }
}

export default router;
