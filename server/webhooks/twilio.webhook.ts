/**
 * Twilio Webhook Handler
 * 
 * Handles incoming webhooks from Twilio for:
 * - Message status updates (sent, delivered, failed)
 * - Inbound messages
 * - Call status updates
 * - Inbound calls
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { smsMessages, voiceCalls } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { redisService, CacheKeys } from '../services/redisService';

const router = Router();

// Twilio message status values
type TwilioMessageStatus = 
  | 'accepted'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'receiving'
  | 'received'
  | 'read';

// Twilio call status values
type TwilioCallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled';

interface TwilioMessageWebhook {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body?: string;
  MessageStatus: TwilioMessageStatus;
  ErrorCode?: string;
  ErrorMessage?: string;
  NumMedia?: string;
  NumSegments?: string;
}

interface TwilioCallWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: TwilioCallStatus;
  CallDuration?: string;
  Direction?: string;
  Timestamp?: string;
}

/**
 * Message Status Callback
 * POST /api/webhooks/twilio/message-status
 * 
 * Called by Twilio when message status changes
 */
router.post('/message-status', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as TwilioMessageWebhook;
    
    console.log(`[Twilio Webhook] Message status update: ${webhook.MessageSid} -> ${webhook.MessageStatus}`);

    // Find and update the message in database
    const existingMessages = await db
      .select()
      .from(smsMessages)
      .where(eq(smsMessages.messageSid, webhook.MessageSid))
      .limit(1);

    if (existingMessages.length > 0) {
      const message = existingMessages[0];
      
      // Update message status
      await db
        .update(smsMessages)
        .set({
          status: webhook.MessageStatus,
        })
        .where(eq(smsMessages.id, message.id));

      // Invalidate cache for this account
      if (message.accountId) {
        await redisService.invalidateAccount(message.accountId);
      }

      console.log(`[Twilio Webhook] Updated message ${webhook.MessageSid} status to ${webhook.MessageStatus}`);
    } else {
      console.log(`[Twilio Webhook] Message ${webhook.MessageSid} not found in database`);
    }

    // Twilio expects 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('[Twilio Webhook] Error processing message status:', error);
    res.status(500).send('Error');
  }
});

/**
 * Inbound Message Handler
 * POST /api/webhooks/twilio/inbound-message
 * 
 * Called by Twilio when a message is received
 */
router.post('/inbound-message', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as TwilioMessageWebhook;
    
    console.log(`[Twilio Webhook] Inbound message from ${webhook.From} to ${webhook.To}`);

    // Find the account that owns this phone number
    // For now, we'll store with a default account - in production, look up by To number
    const accountId = await findAccountByPhoneNumber(webhook.To);

    // Store the inbound message
    await db.insert(smsMessages).values({
      userId: 1, // Default user - should be looked up
      accountId: accountId,
      to: webhook.To,
      from: webhook.From,
      body: webhook.Body || '',
      status: 'received',
      direction: 'inbound',
      sentAt: new Date(),
      messageSid: webhook.MessageSid,
    });

    // Invalidate cache
    if (accountId) {
      await redisService.invalidateAccount(accountId);
    }

    console.log(`[Twilio Webhook] Stored inbound message ${webhook.MessageSid}`);

    // Return empty TwiML response (no auto-reply)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('[Twilio Webhook] Error processing inbound message:', error);
    res.status(500).send('Error');
  }
});

/**
 * Call Status Callback
 * POST /api/webhooks/twilio/call-status
 * 
 * Called by Twilio when call status changes
 */
router.post('/call-status', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as TwilioCallWebhook;
    
    console.log(`[Twilio Webhook] Call status update: ${webhook.CallSid} -> ${webhook.CallStatus}`);

    // Find and update the call in database
    const existingCalls = await db
      .select()
      .from(voiceCalls)
      .where(eq(voiceCalls.callSid, webhook.CallSid))
      .limit(1);

    if (existingCalls.length > 0) {
      const call = existingCalls[0];
      
      // Update call status and duration
      const updateData: any = {
        status: webhook.CallStatus,
      };

      if (webhook.CallDuration) {
        updateData.duration = parseInt(webhook.CallDuration);
      }

      if (webhook.CallStatus === 'completed' || webhook.CallStatus === 'failed') {
        updateData.endTime = new Date();
      }

      await db
        .update(voiceCalls)
        .set(updateData)
        .where(eq(voiceCalls.id, call.id));

      // Invalidate cache for this account
      if (call.accountId) {
        await redisService.invalidateAccount(call.accountId);
      }

      console.log(`[Twilio Webhook] Updated call ${webhook.CallSid} status to ${webhook.CallStatus}`);
    } else {
      console.log(`[Twilio Webhook] Call ${webhook.CallSid} not found in database`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Twilio Webhook] Error processing call status:', error);
    res.status(500).send('Error');
  }
});

/**
 * Inbound Call Handler
 * POST /api/webhooks/twilio/inbound-call
 * 
 * Called by Twilio when a call is received
 */
router.post('/inbound-call', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as TwilioCallWebhook;
    
    console.log(`[Twilio Webhook] Inbound call from ${webhook.From} to ${webhook.To}`);

    const accountId = await findAccountByPhoneNumber(webhook.To);

    // Store the inbound call
    await db.insert(voiceCalls).values({
      userId: 1, // Default user
      accountId: accountId,
      to: webhook.To,
      from: webhook.From,
      status: 'ringing',
      direction: 'inbound',
      duration: 0,
      startTime: new Date(),
      callSid: webhook.CallSid,
    });

    // Invalidate cache
    if (accountId) {
      await redisService.invalidateAccount(accountId);
    }

    // Return TwiML to handle the call (basic response)
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling Elite Financial. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="/api/webhooks/twilio/recording" />
</Response>`);
  } catch (error) {
    console.error('[Twilio Webhook] Error processing inbound call:', error);
    res.status(500).send('Error');
  }
});

/**
 * Recording Handler
 * POST /api/webhooks/twilio/recording
 */
router.post('/recording', async (req: Request, res: Response) => {
  try {
    const { CallSid, RecordingUrl, RecordingDuration } = req.body;
    
    console.log(`[Twilio Webhook] Recording received for call ${CallSid}: ${RecordingUrl}`);

    // Update call with recording URL
    if (CallSid) {
      await db
        .update(voiceCalls)
        .set({
          recordingUrl: RecordingUrl,
          duration: parseInt(RecordingDuration) || 0,
        })
        .where(eq(voiceCalls.callSid, CallSid));
    }

    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Goodbye.</Say></Response>');
  } catch (error) {
    console.error('[Twilio Webhook] Error processing recording:', error);
    res.status(500).send('Error');
  }
});

/**
 * Helper function to find account by phone number
 */
async function findAccountByPhoneNumber(phoneNumber: string): Promise<number | null> {
  try {
    // Look up the phone number in account_phone_numbers table
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
    console.error('[Twilio Webhook] Error finding account by phone number:', error);
    return null;
  }
}

export default router;
