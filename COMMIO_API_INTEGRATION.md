# Commio (thinQ) API Integration Guide

## Overview
Commio provides communication APIs similar to Twilio. This document outlines the integration approach.

## API Base URL
```
https://api.thinq.com/v1
```

## Authentication
Commio uses API Key authentication with the following headers:
- `Authorization: Bearer {api_key}`
- `X-Account-ID: {account_id}`

## Key Endpoints

### Account Management
- `GET /account` - Get account information
- `GET /account/balance` - Get account balance

### Phone Numbers
- `GET /phone-numbers` - List owned phone numbers
- `GET /phone-numbers/available` - Search available numbers
- `POST /phone-numbers` - Purchase a phone number
- `DELETE /phone-numbers/{number}` - Release a phone number
- `GET /phone-numbers/{number}` - Get number details

### Messaging (SMS/MMS)
- `POST /messages` - Send a message
- `GET /messages` - List messages
- `GET /messages/{id}` - Get message details
- Query params: `start_date`, `end_date`, `direction`, `status`

### Voice Calls
- `POST /calls` - Initiate a call
- `GET /calls` - List calls
- `GET /calls/{id}` - Get call details
- Query params: `start_date`, `end_date`, `direction`, `status`

### Usage & Analytics
- `GET /usage` - Get usage records
- `GET /analytics` - Get analytics data
- Query params: `start_date`, `end_date`, `category`

## Request/Response Format

### Send Message
```json
POST /messages
{
  "to": "+15551234567",
  "from": "+15559876543",
  "body": "Hello World",
  "media_urls": ["https://example.com/image.jpg"]
}

Response:
{
  "id": "msg_123",
  "status": "queued",
  "to": "+15551234567",
  "from": "+15559876543",
  "created_at": "2024-01-15T00:00:00Z"
}
```

### Make Call
```json
POST /calls
{
  "to": "+15551234567",
  "from": "+15559876543",
  "url": "https://example.com/twiml"
}

Response:
{
  "id": "call_123",
  "status": "queued",
  "to": "+15551234567",
  "from": "+15559876543",
  "created_at": "2024-01-15T00:00:00Z"
}
```

## Implementation Status

### Current Implementation
The `CommioProvider` class in `/server/providers/commio.provider.ts` has:
- ✅ Basic structure matching `ICommunicationProvider` interface
- ✅ API request helper method
- ✅ Credential validation
- ✅ Phone number management
- ✅ Messaging (send/receive)
- ✅ Voice calls
- ✅ Usage tracking
- ✅ Analytics aggregation

### Integration Points
1. **Provider Factory** - Already configured to create Commio instances
2. **Settings UI** - Already has Commio connection form
3. **Account Switcher** - Already supports multiple providers
4. **Data Service** - Already aggregates data from multiple providers

## Testing Approach

### 1. Credential Validation
Test with real Commio API credentials:
```typescript
const provider = new CommioProvider({
  accountSid: 'your_account_id',
  authToken: 'your_api_key'
});
const isValid = await provider.validateCredentials();
```

### 2. Phone Numbers
```typescript
const numbers = await provider.getPhoneNumbers();
const available = await provider.searchAvailableNumbers({
  areaCode: '855',
  smsEnabled: true
});
```

### 3. Messaging
```typescript
const result = await provider.sendMessage({
  to: '+15551234567',
  from: '+15559876543',
  body: 'Test message'
});
```

### 4. Analytics
```typescript
const analytics = await provider.getAnalytics();
// Returns aggregated data for dashboard
```

## Next Steps

1. **Get Real API Credentials**: Obtain Commio API key and account ID
2. **Test Endpoints**: Verify each endpoint with real API calls
3. **Error Handling**: Add proper error handling for API failures
4. **Rate Limiting**: Implement rate limiting if needed
5. **Webhooks**: Set up webhook endpoints for incoming messages/calls
6. **Documentation**: Update with actual API response structures

## Differences from Twilio

| Feature | Twilio | Commio |
|---------|--------|--------|
| Auth | Account SID + Auth Token | Account ID + API Key |
| SDK | Official Node SDK | REST API (no official SDK) |
| Phone Format | E.164 | E.164 |
| Webhooks | TwiML | JSON callbacks |
| Pricing | Per message/call | Per message/call |

## Notes
- Commio API may have different field names than Twilio
- Response structures need to be mapped to our unified interface
- Some features may not have 1:1 parity with Twilio
- Error codes and messages will differ
