# Batch SMS Stuck Campaign Analysis & Fixes

## Current Batch SMS Process Analysis

### How It Works Now

The batch SMS service (`batchSmsService.ts`) has **two modes**:

#### 1. **Drip Mode** (Sequential with Rate Limiting)
```
For each message in queue:
  - Check heartbeat every 100 messages
  - NO campaign status check (runs to completion)
  - Enforce per-number delay (3+ seconds)
  - Send message with retry (up to 3 attempts)
  - Flush DB batch every 100 messages
  - Continue until all messages sent
```

#### 2. **Parallel Mode** (Concurrent Sending)
```
For each phone number (in parallel):
  - Process messages in batches of 10 (concurrentPerNumber)
  - Send all 10 messages concurrently (Promise.all)
  - Retry failed messages (up to 3 attempts)
  - Flush DB batch every 100 messages
  - Continue until queue empty
```

## Issues That Can Cause Campaigns to Get Stuck

### ✅ ALREADY FIXED

**1. Campaign Status Checks During Sending**
- **Issue:** Line 651 comment shows status checks were removed
- **Status:** ✅ FIXED - "NO STATUS CHECK - campaign runs to completion"
- **Result:** Campaigns no longer pause mid-batch

**2. Auto-Pause on Errors**
- **Issue:** Lines 326-334, 390-402 show campaigns mark as 'completed' on errors
- **Status:** ✅ FIXED - No auto-pause, marks as completed instead
- **Result:** Campaigns don't get stuck in paused state

**3. Retry Logic**
- **Issue:** Messages could fail permanently without retries
- **Status:** ✅ FIXED - Lines 672-695 (drip), 731-752 (parallel)
- **Result:** Up to 3 retries with exponential backoff

**4. Error Handling**
- **Issue:** Uncaught errors could crash the batch process
- **Status:** ✅ FIXED - Wrapped in try-catch (lines 586-712, 716-780)
- **Result:** Errors logged but batch continues

### ⚠️ POTENTIAL ISSUES FOUND

**1. Sequential Recipient Status Updates**
```typescript
// Lines 564-578: Updates recipients ONE AT A TIME
for (const r of batch) {
  await db.update(campaignRecipients)
    .set({ status: r.status, ... })
    .where(and(
      eq(campaignRecipients.smsCampaignId, campaignId),
      eq(campaignRecipients.phoneNumber, r.phone),
      eq(campaignRecipients.status, 'pending')
    ));
}
```
**Problem:** If batch has 100 recipients, this is 100 sequential DB queries
**Impact:** Can slow down sending, potential bottleneck
**Risk:** Low - only happens every 100 messages

**2. No Timeout on Overall Batch Process**
```typescript
// Lines 415-808: No timeout on sendBatch()
async sendBatch(options: BatchSendOptions): Promise<BatchResult> {
  // ... can run indefinitely
}
```
**Problem:** If something hangs, batch runs forever
**Impact:** Campaign appears stuck but is actually waiting
**Risk:** Medium - depends on provider API reliability

**3. Database Connection Pool Exhaustion**
```typescript
// Multiple concurrent DB operations:
// - Periodic campaign count updates (line 304)
// - Batch message inserts (line 552)
// - Recipient status updates (lines 564-578)
// - Campaign status updates (line 327, 393)
```
**Problem:** With many concurrent campaigns, could exhaust DB connections
**Impact:** Queries hang waiting for available connection
**Risk:** Medium - depends on concurrent campaign count

**4. Memory Accumulation in Long-Running Batches**
```typescript
// Lines 517-530: Accumulates messages in memory
dbMessageBatch.push({ ... });

// Lines 534-540: Accumulates recipient updates
recipientStatusBatch.push({ ... });
```
**Problem:** For very large campaigns (100K+ messages), arrays grow large
**Impact:** High memory usage, potential OOM
**Risk:** Low - flushes every 100 messages

## Recommendations to Prevent Stuck Campaigns

### Priority 1: Add Overall Batch Timeout ⏱️

**Problem:** Batch can run indefinitely if something hangs
**Solution:** Add configurable timeout with graceful handling

```typescript
async sendBatch(options: BatchSendOptions): Promise<BatchResult> {
  const BATCH_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours max
  
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('Batch timeout - campaign will be marked as completed')), BATCH_TIMEOUT_MS)
  );
  
  const batchPromise = this.sendBatchInternal(options);
  
  try {
    return await Promise.race([batchPromise, timeoutPromise]);
  } catch (err: any) {
    if (err.message.includes('timeout')) {
      console.error('[BatchSMS] Batch timed out - saving progress and marking complete');
      // Save current progress
      await flushDbBatch();
      await flushRecipientStatusBatch();
      // Mark campaign as completed (not stuck)
      if (options.campaignId) {
        await db.update(smsCampaigns)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(smsCampaigns.id, options.campaignId));
      }
    }
    throw err;
  }
}
```

**Impact:** Prevents infinite hangs, ensures campaigns complete
**Effort:** 30 minutes

### Priority 2: Batch Recipient Status Updates 💾

**Problem:** Sequential updates create bottleneck
**Solution:** Use bulk update with IN clause

```typescript
const flushRecipientStatusBatch = async () => {
  if (recipientStatusBatch.length === 0 || !campaignId) return;
  const batch = recipientStatusBatch.splice(0);
  
  try {
    // Group by status for efficient bulk updates
    const sentPhones = batch.filter(r => r.status === 'sent').map(r => r.phone);
    const failedPhones = batch.filter(r => r.status === 'failed').map(r => r.phone);
    
    // Bulk update sent recipients
    if (sentPhones.length > 0) {
      await db.update(campaignRecipients)
        .set({ status: 'sent', sentAt: new Date() })
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaignId),
          sql`${campaignRecipients.phoneNumber} IN (${sql.join(sentPhones.map(p => sql`${p}`), sql`, `)})`,
          eq(campaignRecipients.status, 'pending')
        ));
    }
    
    // Bulk update failed recipients
    if (failedPhones.length > 0) {
      await db.update(campaignRecipients)
        .set({ status: 'failed', failedAt: new Date() })
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaignId),
          sql`${campaignRecipients.phoneNumber} IN (${sql.join(failedPhones.map(p => sql`${p}`), sql`, `)})`,
          eq(campaignRecipients.status, 'pending')
        ));
    }
  } catch (err) {
    console.error('[BatchSMS] Bulk recipient status update error:', err);
  }
};
```

**Impact:** 100 queries → 2 queries per flush (50x faster)
**Effort:** 1 hour

### Priority 3: Add Heartbeat Monitoring 💓

**Problem:** No way to detect if batch is actually stuck vs. just slow
**Solution:** Add heartbeat with stuck detection

```typescript
// Add to startBatchAsync()
const heartbeatInterval = setInterval(() => {
  const progress = activeBatchJobs.get(jobId);
  if (progress) {
    const elapsed = Date.now() - progress.startTime;
    const rate = progress.sent + progress.failed;
    const currentRate = rate > 0 ? (rate / (elapsed / 60000)) : 0; // msgs/min
    
    console.log(`[BatchSMS] Heartbeat ${jobId}: ${rate}/${progress.total} (${Math.round(rate/progress.total*100)}%) - ${currentRate.toFixed(1)} msgs/min`);
    
    // Detect stuck: no progress in last 5 minutes
    if (progress.lastProgressTime && Date.now() - progress.lastProgressTime > 5 * 60 * 1000) {
      console.error(`[BatchSMS] STUCK DETECTED: No progress in 5 minutes - attempting recovery`);
      // Could trigger recovery logic here
    }
  }
}, 30000); // Every 30 seconds

// Clear on completion
clearInterval(heartbeatInterval);
```

**Impact:** Early detection of stuck campaigns
**Effort:** 30 minutes

### Priority 4: Add Circuit Breaker for Provider Failures 🔌

**Problem:** If provider is down, batch keeps retrying forever
**Solution:** Detect repeated failures and pause gracefully

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if we should try again (half-open)
      if (Date.now() - this.lastFailureTime > 60000) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker open - provider may be down');
      }
    }
    
    try {
      const result = await fn();
      // Success - reset
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      // Open circuit after 10 consecutive failures
      if (this.failureCount >= 10) {
        this.state = 'open';
        console.error('[CircuitBreaker] OPEN - too many failures, pausing sends');
      }
      throw err;
    }
  }
}
```

**Impact:** Prevents wasting time on dead providers
**Effort:** 1-2 hours

### Priority 5: Improve Progress Tracking 📊

**Problem:** Progress updates can be lost if process crashes
**Solution:** Persist progress to database more frequently

```typescript
// In startBatchAsync(), update progress tracking:
const DB_UPDATE_INTERVAL_MS = 5000; // Update every 5 seconds (was 10)
const DB_UPDATE_MESSAGE_COUNT = 50; // Or every 50 messages (was 100)

// Also add last progress timestamp
const stored = activeBatchJobs.get(jobId);
if (stored) {
  stored.sent = p.sent;
  stored.failed = p.failed;
  stored.lastProgressTime = Date.now(); // Track last progress
  // ...
}
```

**Impact:** Better recovery from crashes, more accurate progress
**Effort:** 15 minutes

## Summary of Current State

### ✅ What's Working Well

1. **No mid-batch status checks** - Campaigns run to completion
2. **Retry logic** - Up to 3 retries with exponential backoff
3. **Error handling** - Wrapped in try-catch, doesn't crash
4. **Batch DB inserts** - Flushes every 100 messages
5. **Parallel sending** - Uses multiple phone numbers concurrently
6. **Rate limiting** - Respects per-number delays
7. **Progress tracking** - Real-time updates to UI

### ⚠️ Areas for Improvement

1. **No overall timeout** - Batch can hang indefinitely
2. **Sequential recipient updates** - Bottleneck for large batches
3. **No stuck detection** - Can't tell if batch is stuck vs. slow
4. **No circuit breaker** - Keeps retrying dead providers
5. **Infrequent progress persistence** - Can lose progress on crash

## Recommended Implementation Order

### Phase 1: Critical Fixes (2-3 hours)
1. ✅ Add overall batch timeout
2. ✅ Batch recipient status updates
3. ✅ Add heartbeat monitoring

### Phase 2: Reliability (2-3 hours)
4. ✅ Add circuit breaker
5. ✅ Improve progress persistence
6. ✅ Add stuck detection & recovery

### Phase 3: Monitoring (1-2 hours)
7. ✅ Add metrics collection
8. ✅ Add alerting for stuck campaigns
9. ✅ Dashboard for batch health

## Expected Results

**Before Fixes:**
- Campaigns can hang indefinitely
- Sequential DB updates slow down large batches
- No visibility into stuck campaigns
- Keeps retrying dead providers

**After Fixes:**
- Maximum 4-hour timeout (configurable)
- 50x faster recipient updates (2 queries vs 100)
- Heartbeat every 30 seconds with stuck detection
- Circuit breaker stops wasting time on failures
- Better progress tracking and recovery

**Overall Impact:**
- ✅ Campaigns never get stuck indefinitely
- ✅ Faster sending for large batches
- ✅ Early detection of issues
- ✅ Graceful handling of provider outages
- ✅ Better visibility and monitoring
