# SMS Campaign Batch Sending Optimization Scope

## Current Implementation Analysis

### Architecture Overview

**Two Sending Methods:**
1. **campaignService.ts** - Sequential sending (1 message at a time)
2. **batchSmsService.ts** - Parallel batch sending (not currently used by campaigns)

### Current Campaign Sending Flow (`campaignService.ts`)

```
Campaign Start → sendCampaignMessages()
  ↓
  Loop: Get 100 recipients
  ↓
  For each recipient (SEQUENTIAL):
    - Apply merge tags
    - Send via provider API
    - Update recipient status in DB (2 queries per message)
    - Update campaign counts in DB (2 queries per message)
    - Sleep for rate limiting (1000ms / sendingRate)
  ↓
  Repeat until no pending recipients
```

## Identified Bottlenecks

### 1. **Sequential Processing** 🐌
- **Issue:** Sends 1 message at a time in a loop
- **Impact:** For 10,000 messages at 1 msg/sec = 2.7+ hours
- **Location:** `campaignService.ts:1145-1213`

### 2. **Excessive Database Writes** 💾
- **Issue:** 4 DB queries per message
  - 2 queries to update recipient status
  - 2 queries to increment campaign counts
- **Impact:** 10,000 messages = 40,000 DB queries
- **Location:** `campaignService.ts:1164-1211`

### 3. **No Parallelization** ⚡
- **Issue:** Not using available phone numbers concurrently
- **Impact:** If you have 10 phone numbers, could send 10x faster
- **Current:** 1 message/sec total
- **Potential:** 10 messages/sec (1 per number)

### 4. **Synchronous Rate Limiting** ⏱️
- **Issue:** `await sleep(1000 / sendingRate)` blocks entire loop
- **Impact:** Wastes time between messages
- **Location:** `campaignService.ts:1194-1195`

### 5. **Count Drift Issues** 📊
- **Issue:** Incremental count updates (`sentCount + 1`) can drift
- **Current Fix:** `reconcileCampaignCounts()` recalculates from DB
- **Better:** Batch updates or use actual recipient counts

## Optimization Opportunities

### Priority 1: Switch to Parallel Batch Sending ⚡⚡⚡

**Impact:** 10-50x speed improvement

**Implementation:**
- Use existing `batchSmsService.ts` instead of `campaignService.ts`
- Already supports:
  - ✅ Parallel sending across multiple phone numbers
  - ✅ Concurrent requests per number (default 10)
  - ✅ Progress tracking
  - ✅ Rate limiting per number
  - ✅ Automatic retry logic

**Changes Required:**
```typescript
// In campaignService.ts startSmsCampaign()
// REPLACE: sendCampaignMessages(smsCampaignId, campaign, account, provider)
// WITH: Use batchSmsService.startBatchAsync()
```

**Expected Performance:**
- Current: 1 msg/sec = 10,000 msgs in 2.7 hours
- With 10 numbers @ 10 concurrent each: 100 msgs/sec = 10,000 msgs in 1.7 minutes
- **~95% reduction in send time**

### Priority 2: Batch Database Updates 💾💾

**Impact:** 90% reduction in DB queries

**Implementation:**
- Collect status updates in memory
- Write to DB every 100 messages or 10 seconds
- Already partially implemented in `batchSmsService.ts:299-315`

**Changes Required:**
```typescript
// Instead of updating DB per message:
// UPDATE campaign_recipients SET status = 'sent' WHERE id = ?
// UPDATE sms_campaigns SET sent_count = sent_count + 1 WHERE id = ?

// Batch update every 100 messages:
// UPDATE campaign_recipients SET status = 'sent' WHERE id IN (?, ?, ?, ...)
// UPDATE sms_campaigns SET sent_count = sent_count + 100 WHERE id = ?
```

**Expected Impact:**
- Current: 40,000 queries for 10,000 messages
- Optimized: ~400 queries (100x batches)
- **90% reduction in DB load**

### Priority 3: Optimize Progress Tracking 📊

**Impact:** Smoother UI updates, less overhead

**Current Issues:**
- Frontend polls every 5 seconds
- Backend updates DB every message
- Can cause flickering and excessive writes

**Recommendations:**
1. **In-memory progress tracking** (already in batchSmsService)
2. **Periodic DB updates** (every 10 seconds, already implemented)
3. **WebSocket for real-time updates** (future enhancement)

### Priority 4: Smart Rate Limiting ⏱️

**Impact:** Maximize throughput while respecting limits

**Current:**
- Fixed rate: `sleep(1000 / sendingRate)`
- Blocks entire process

**Recommended:**
- **Token bucket algorithm** (already in batchSmsService)
- **Per-number rate limiting** (already implemented)
- **Dynamic rate adjustment** based on provider responses

**Implementation:**
```typescript
// batchSmsService already has:
messagesPerMinute: 30 (default safe rate)
concurrentPerNumber: 10 (parallel requests)
```

### Priority 5: Connection Pooling & Reuse 🔌

**Impact:** Reduce API latency

**Current:**
- Creates new HTTP connections for each message
- No connection pooling

**Recommendations:**
1. **Twilio client reuse** (already implemented in batchSmsService)
2. **HTTP/2 keep-alive** for Commio API
3. **Connection pooling** for database

## Recommended Implementation Plan

### Phase 1: Quick Wins (1-2 hours) 🚀

**Goal:** 10-20x speed improvement

1. **Switch campaigns to use batchSmsService**
   - Modify `startSmsCampaign()` to call `batchSmsService.startBatchAsync()`
   - Map campaign data to batch service format
   - Test with small campaign (100 recipients)

2. **Enable multi-number parallel sending**
   - Already supported in batchSmsService
   - Just need to pass multiple phone numbers

**Expected Result:**
- 10,000 messages: 2.7 hours → 15-20 minutes

### Phase 2: Database Optimization (2-3 hours) 💾

**Goal:** Reduce DB load by 90%

1. **Implement batch recipient updates**
   - Collect updates in memory
   - Flush every 100 messages or 10 seconds
   
2. **Use reconcileCampaignCounts() more effectively**
   - Call only at pause/complete/limit
   - Remove incremental count updates

**Expected Result:**
- 40,000 DB queries → 400 queries
- Reduced database CPU usage
- Faster campaign completion

### Phase 3: Advanced Features (4-6 hours) ⚡

**Goal:** Production-grade reliability

1. **Implement retry logic**
   - Automatic retry for transient failures
   - Exponential backoff
   - Dead letter queue for permanent failures

2. **Add circuit breaker pattern**
   - Detect provider outages
   - Auto-pause campaigns
   - Resume when provider recovers

3. **Implement delivery tracking**
   - Webhook handlers for delivery receipts
   - Real-time delivery rate calculation
   - Auto-adjust sending rate based on delivery

4. **Add monitoring & alerts**
   - Track sending rate (msgs/sec)
   - Monitor error rates
   - Alert on anomalies

## Performance Comparison

### Current Implementation
```
Campaign: 10,000 recipients
Phone Numbers: 10 available
Sending Rate: 1 msg/sec (sequential)

Time: 10,000 seconds = 2.7 hours
DB Queries: 40,000
Throughput: 1 msg/sec
```

### Optimized Implementation (Phase 1)
```
Campaign: 10,000 recipients
Phone Numbers: 10 available
Concurrent per number: 10
Effective rate: 100 msgs/sec

Time: 100 seconds = 1.7 minutes
DB Queries: 40,000 (not yet optimized)
Throughput: 100 msg/sec
Speed Improvement: 100x faster
```

### Fully Optimized (Phase 1 + 2)
```
Campaign: 10,000 recipients
Phone Numbers: 10 available
Concurrent per number: 10
Batch DB updates: Every 100 messages

Time: 100 seconds = 1.7 minutes
DB Queries: 400
Throughput: 100 msg/sec
Speed Improvement: 100x faster
DB Load Reduction: 90%
```

## Code Changes Required

### 1. Update `startSmsCampaign()` in campaignService.ts

```typescript
// BEFORE (current):
sendCampaignMessages(smsCampaignId, campaign, account, provider.code as ProviderCode)
  .catch(error => { /* handle error */ });

// AFTER (optimized):
import { batchSmsService } from './batchSmsService';

// Get all available phone numbers for this account
const phoneNumbers = await getAccountPhoneNumbers(account.id);

// Get pending recipients
const recipients = await db.select()
  .from(campaignRecipients)
  .where(and(
    eq(campaignRecipients.smsCampaignId, smsCampaignId),
    eq(campaignRecipients.status, 'pending')
  ));

// Start batch sending
const { jobId, total } = await batchSmsService.startBatchAsync({
  recipients: recipients.map(r => ({
    phone: r.phoneNumber,
    firstName: r.firstName,
    lastName: r.lastName,
    ...r.customFields
  })),
  message: campaign.messageTemplate,
  phoneNumbers: phoneNumbers.map(pn => ({
    phoneNumber: pn.phoneNumber,
    provider: pn.provider,
    accountSid: account.accountSid,
    authToken: account.authToken,
    // ... other credentials
  })),
  campaignId: smsCampaignId,
  userId: campaign.userId,
  messagesPerNumber: 2000, // Twilio daily limit
  concurrentPerNumber: 10, // Parallel requests
  totalCampaignRecipients: campaign.recipientCount,
});
```

### 2. Remove Sequential Sending Loop

```typescript
// DELETE: sendCampaignMessages() function (lines 1072-1221)
// This is replaced by batchSmsService
```

### 3. Keep reconcileCampaignCounts() for Accuracy

```typescript
// KEEP: reconcileCampaignCounts() function
// Call it at strategic points:
// - When campaign pauses
// - When campaign completes
// - When campaign reaches limit
```

## Testing Strategy

### 1. Small Campaign Test (100 recipients)
- Verify all messages sent
- Check recipient status updates
- Confirm counts are accurate
- Monitor for errors

### 2. Medium Campaign Test (1,000 recipients)
- Test pause/resume functionality
- Verify recipient limit enforcement
- Check progress tracking
- Monitor database load

### 3. Large Campaign Test (10,000+ recipients)
- Measure actual throughput
- Monitor memory usage
- Check for memory leaks
- Verify auto-recovery works

### 4. Multi-Campaign Test
- Run 3 campaigns simultaneously
- Verify no interference
- Check resource usage
- Confirm accurate tracking

## Risks & Mitigation

### Risk 1: Provider Rate Limits
- **Mitigation:** Respect provider limits (already implemented)
- **Twilio:** 1 msg/sec per number (default)
- **Commio:** Configurable rate limits

### Risk 2: Database Connection Pool Exhaustion
- **Mitigation:** Batch updates, connection pooling
- **Monitor:** Active connections, query latency

### Risk 3: Memory Usage with Large Campaigns
- **Mitigation:** Process in chunks, don't load all recipients
- **Current:** Loads 100 at a time (good)

### Risk 4: Count Drift During Concurrent Sending
- **Mitigation:** Use reconcileCampaignCounts() at completion
- **Already implemented:** Recalculates from actual recipient statuses

## Success Metrics

### Performance Metrics
- ✅ **Send time:** 100x faster (2.7 hours → 1.7 minutes for 10K msgs)
- ✅ **Throughput:** 100 msgs/sec (vs 1 msg/sec)
- ✅ **DB queries:** 90% reduction (40K → 400)

### Reliability Metrics
- ✅ **Delivery rate:** >95% (track via webhooks)
- ✅ **Error rate:** <5%
- ✅ **Count accuracy:** 100% (via reconciliation)

### User Experience Metrics
- ✅ **Progress updates:** Real-time (every 5 seconds)
- ✅ **No UI flickering:** Stable status display
- ✅ **Pause/resume:** Works reliably

## Next Steps

1. **Review this scope** with stakeholders
2. **Prioritize phases** based on business needs
3. **Allocate development time** (estimate: 7-11 hours total)
4. **Set up testing environment** with test phone numbers
5. **Implement Phase 1** (quick wins)
6. **Measure results** and iterate

## Conclusion

The current SMS campaign sending is **functional but inefficient**. By switching to the existing `batchSmsService` and implementing batch database updates, we can achieve:

- **100x faster sending** (2.7 hours → 1.7 minutes)
- **90% less database load** (40K → 400 queries)
- **Better user experience** (real-time progress, no flickering)
- **More reliable** (auto-recovery, accurate counts)

The best part: **Most of the code already exists** in `batchSmsService.ts`. We just need to wire it up to campaigns instead of using the sequential sending loop.

**Estimated Total Effort:** 7-11 hours
**Expected ROI:** Massive - campaigns that took hours will complete in minutes
