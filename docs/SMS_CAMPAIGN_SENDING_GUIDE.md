# Elite American Financial - SMS Campaign Sending Guide

## How Bulk SMS Sending Works

This guide explains how the Elite American Financial platform sends bulk SMS campaigns using Twilio and Commio as the SMS engines.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SMS Campaign Flow                             │
└─────────────────────────────────────────────────────────────────┘

1. CREATE CAMPAIGN
   ┌─────────────┐
   │   User UI   │ ──► Create Campaign with:
   └─────────────┘     • Campaign Name
                       • Message Template (with merge tags)
                       • From Number
                       • Contact List

2. ADD RECIPIENTS
   ┌─────────────┐
   │Contact List │ ──► Recipients added to campaign_recipients table
   └─────────────┘     • Opt-out numbers filtered
                       • Duplicates removed

3. START CAMPAIGN
   ┌─────────────┐
   │   Start     │ ──► Campaign status → "sending"
   └─────────────┘     Background process begins

4. SEND MESSAGES (Background)
   ┌─────────────────────────────────────────────────────────────┐
   │                                                             │
   │  For each recipient:                                        │
   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
   │  │ Get Pending │ ──►│ Personalize │ ──►│Send via     │     │
   │  │ Recipients  │    │ Message     │    │Provider     │     │
   │  └─────────────┘    └─────────────┘    └─────────────┘     │
   │                                              │              │
   │                     ┌────────────────────────┼──────────┐   │
   │                     │                        │          │   │
   │                     ▼                        ▼          │   │
   │              ┌─────────────┐          ┌─────────────┐   │   │
   │              │   Twilio    │          │   Commio    │   │   │
   │              │   Provider  │          │   Provider  │   │   │
   │              └─────────────┘          └─────────────┘   │   │
   │                     │                        │          │   │
   │                     └────────────────────────┘          │   │
   │                              │                          │   │
   │                              ▼                          │   │
   │                     ┌─────────────┐                     │   │
   │                     │   Carrier   │                     │   │
   │                     │   Network   │                     │   │
   │                     └─────────────┘                     │   │
   │                              │                          │   │
   │                              ▼                          │   │
   │                     ┌─────────────┐                     │   │
   │                     │  Recipient  │                     │   │
   │                     │   Phone     │                     │   │
   │                     └─────────────┘                     │   │
   │                                                         │   │
   └─────────────────────────────────────────────────────────┘   │
                                                                  │
5. TRACK DELIVERY                                                 │
   ┌─────────────┐                                                │
   │  Webhooks   │ ◄─────────────────────────────────────────────┘
   └─────────────┘
   • Update recipient status (sent/delivered/failed)
   • Update campaign statistics
```

---

## Provider Abstraction

The system uses a **Provider Abstraction Layer** that allows seamless switching between Twilio and Commio:

### Provider Interface

```typescript
interface ICommunicationProvider {
  // Send a single SMS message
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;
  
  // Other methods...
}

interface SendMessageOptions {
  to: string;      // Recipient phone number
  from: string;    // Sender phone number
  body: string;    // Message content
  mediaUrls?: string[];  // MMS media URLs
}

interface SendMessageResult {
  success: boolean;
  sid?: string;     // Message ID from provider
  status?: string;  // queued, sent, delivered, failed
  error?: string;   // Error message if failed
}
```

### Twilio Implementation

```typescript
// server/providers/twilio.provider.ts
async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const message = await this.client.messages.create({
    to: options.to,
    from: options.from,
    body: options.body,
    mediaUrl: options.mediaUrls,
  });

  return {
    success: true,
    sid: message.sid,
    status: message.status,
  };
}
```

### Commio Implementation

```typescript
// server/providers/commio.provider.ts
async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const result = await this.apiRequest('POST', '/messages', {
    to: options.to,
    from: options.from,
    body: options.body,
    media_urls: options.mediaUrls,
  });

  return {
    success: true,
    sid: result.id,
    status: result.status,
  };
}
```

---

## Campaign Sending Process

### Step 1: Create Campaign

```typescript
// API: POST /api/campaigns/sms-campaigns
{
  "accountId": 1,
  "name": "January Promotion",
  "messageTemplate": "Hi {{firstName}}, check out our new deals!",
  "fromNumber": "+15551234567"
}
```

### Step 2: Add Recipients from Contact List

```typescript
// API: POST /api/campaigns/sms-campaigns/:id/recipients
{
  "contactListId": 1
}
```

The system:
1. Fetches all contacts from the list
2. Checks each against the opt-out list
3. Skips duplicates
4. Adds valid recipients to `campaign_recipients` table

### Step 3: Start Campaign

```typescript
// API: POST /api/campaigns/sms-campaigns/:id/start
```

The system:
1. Updates campaign status to "sending"
2. Starts background sending process
3. Returns immediately (non-blocking)

### Step 4: Background Sending

```typescript
// server/services/campaignService.ts - sendCampaignMessages()

async function sendCampaignMessages(campaignId, campaign, account, providerCode) {
  // Create provider instance (Twilio or Commio)
  const provider = providerFactory.create({
    code: providerCode,  // 'twilio' or 'commio'
    credentials: {
      accountSid: account.accountSid,
      authToken: account.authToken,
    },
  });

  // Process recipients in batches
  const batchSize = 100;
  
  while (hasMoreRecipients) {
    // Get pending recipients
    const recipients = await db.select()
      .from(campaignRecipients)
      .where(status === 'pending')
      .limit(batchSize);

    for (const recipient of recipients) {
      // Personalize message with merge tags
      const message = applyMergeTags(campaign.messageTemplate, {
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        phoneNumber: recipient.phoneNumber,
      });

      // Send via provider (Twilio or Commio)
      const result = await provider.sendMessage({
        to: recipient.phoneNumber,
        from: campaign.fromNumber,
        body: message,
      });

      // Update recipient status
      if (result.success) {
        await updateRecipient(recipient.id, 'sent', result.sid);
        await incrementCampaignSentCount(campaignId);
      } else {
        await updateRecipient(recipient.id, 'failed', result.error);
        await incrementCampaignFailedCount(campaignId);
      }

      // Rate limiting (messages per second)
      await sleep(1000 / campaign.sendingRate);
    }
  }

  // Mark campaign complete
  await updateCampaignStatus(campaignId, 'completed');
}
```

---

## Merge Tags

The system supports personalization through merge tags:

| Tag | Description | Example |
|-----|-------------|---------|
| `{{firstName}}` | Contact's first name | John |
| `{{lastName}}` | Contact's last name | Doe |
| `{{phoneNumber}}` | Contact's phone | +15551234567 |
| `{{customField}}` | Any custom field | Custom value |

### Example

**Template:**
```
Hi {{firstName}}, this is Elite American Financial. 
Your loan application has been approved! 
Call us at 1-800-XXX-XXXX.
Reply STOP to opt out.
```

**Personalized:**
```
Hi John, this is Elite American Financial. 
Your loan application has been approved! 
Call us at 1-800-XXX-XXXX.
Reply STOP to opt out.
```

---

## Rate Limiting

The system includes built-in rate limiting to:
- Comply with carrier throughput limits
- Avoid being flagged as spam
- Ensure reliable delivery

### Default Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `sendingRate` | 1 msg/sec | Messages per second |
| `batchSize` | 100 | Recipients per batch |

### A2P 10DLC Throughput

After A2P registration, throughput limits are set by carriers:

| Trust Score | Daily Limit | Throughput |
|-------------|-------------|------------|
| Low | 2,000 | 0.2 msg/sec |
| Medium | 10,000 | 1 msg/sec |
| High | 200,000+ | 10+ msg/sec |

---

## Opt-Out Handling

### Automatic Opt-Out

When a recipient replies with STOP, UNSUBSCRIBE, or CANCEL:

1. Webhook receives inbound message
2. System checks for opt-out keywords
3. Phone number added to `opt_out_list`
4. Confirmation sent: "You have been unsubscribed"

### Pre-Send Filtering

Before sending, each recipient is checked:

```typescript
// Check if opted out
const optOuts = await db.select().from(optOutList)
  .where(accountId === campaign.accountId);

const optOutNumbers = new Set(optOuts.map(o => o.phoneNumber));

for (const contact of contacts) {
  if (optOutNumbers.has(contact.phoneNumber)) {
    skip(); // Don't add to recipients
  }
}
```

---

## Delivery Tracking

### Webhook Integration

Both Twilio and Commio send delivery status updates via webhooks:

**Twilio Webhook:** `/api/webhooks/twilio/message-status`
**Commio Webhook:** `/api/webhooks/commio/message-status`

### Status Updates

| Status | Description |
|--------|-------------|
| `queued` | Message accepted, waiting to send |
| `sent` | Message sent to carrier |
| `delivered` | Confirmed delivered to phone |
| `undelivered` | Carrier couldn't deliver |
| `failed` | Send failed |

### Campaign Statistics

Real-time stats available via API:

```typescript
// GET /api/campaigns/sms-campaigns/:id/stats
{
  "recipientCount": 1000,
  "sentCount": 850,
  "deliveredCount": 820,
  "failedCount": 30,
  "optOutCount": 5,
  "pendingCount": 145,
  "deliveryRate": 96.47
}
```

---

## Comparison: Elite American Financial vs ZUVO SMS

| Feature | Elite American Financial | ZUVO SMS |
|---------|-------------------------|----------|
| **SMS Engine** | Twilio + Commio | Single provider |
| **Failover** | ✅ Automatic | ❌ None |
| **Rate Limiting** | ✅ Configurable | ✅ Fixed |
| **Merge Tags** | ✅ Unlimited | ✅ Limited |
| **Opt-Out** | ✅ Automatic | ✅ Automatic |
| **Webhooks** | ✅ Real-time | ✅ Real-time |
| **A2P 10DLC** | ✅ Built-in | ✅ Built-in |
| **Self-Hosted** | ✅ Yes | ❌ No |

---

## Quick Start

### 1. Configure Provider Account

Add your Twilio or Commio credentials in Settings > Sub-Accounts.

### 2. Import Contacts

```bash
# Upload CSV with columns: phone, first_name, last_name, email
POST /api/campaigns/contacts/import
```

### 3. Create & Send Campaign

```bash
# Create campaign
POST /api/campaigns/sms-campaigns
{
  "name": "My Campaign",
  "messageTemplate": "Hi {{firstName}}!",
  "fromNumber": "+15551234567"
}

# Add recipients
POST /api/campaigns/sms-campaigns/1/recipients
{ "contactListId": 1 }

# Start sending
POST /api/campaigns/sms-campaigns/1/start
```

---

## Troubleshooting

### Messages Not Sending

1. **Check account credentials** - Verify Twilio/Commio API keys
2. **Check phone number** - Ensure "from" number is valid
3. **Check A2P registration** - Campaign must be approved
4. **Check opt-out list** - Recipient may have opted out

### Low Delivery Rate

1. **Verify phone numbers** - Use E.164 format (+1XXXXXXXXXX)
2. **Check message content** - Avoid spam triggers
3. **Review carrier feedback** - Check error codes

### Campaign Stuck in "Sending"

1. **Check server logs** - Look for errors
2. **Pause and resume** - Reset the sending process
3. **Check provider status** - Twilio/Commio may have issues

---

© 2026 Elite American Financial Software
