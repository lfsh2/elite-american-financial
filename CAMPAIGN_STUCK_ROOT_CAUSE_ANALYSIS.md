# Campaign Stuck at 45% - Root Cause Analysis & Fix Scope

## Problem Statement

**Campaign:** elite (ID: 67)
**Stuck At:** 45% (5,442/12,000) for 2-4 minutes
**UI Shows:** Sent: 3,428, Failed: 2,014
**Status:** "Sending" but not progressing

## Root Cause Investigation

### Database Analysis

**Campaign Table:**
```
id: 67
name: elite
status: sending
recipient_count: 12,000
sent_count: 3,428
failed_count: 2,014
updated_at: 2026-02-24 20:23:21 (last update ~25 minutes ago)
```

**Campaign Recipients Table:**
```
sent: 400
failed: 200
pending: 11,400
TOTAL: 12,000 ✓
```

### The Critical Issue: Count Drift 🚨

**DB Shows:** 3,428 sent + 2,014 failed = **5,442 processed**
**Reality:** 400 sent + 200 failed = **600 processed**

**Discrepancy:** 5,442 - 600 = **4,842 phantom messages**

This is a **massive count drift** problem where the campaign counts are being incremented incorrectly, likely from:
1. Previous campaign runs on the same campaign ID
2. Counts not being reset when campaign is restarted
3. Incremental updates (`sentCount + 1`) accumulating across runs

### Why Campaign is Stuck

**Scenario 1: Campaign Actually Stopped Sending**
- Last update was 25+ minutes ago
- No active sending process
- Status still shows "sending" but nothing happening
- **Cause:** Sending process crashed or completed without updating status

**Scenario 2: Campaign Hit Phantom Limit**
- If there's a recipient limit check using `sentCount`
- 3,428 might exceed some limit
- Campaign stops but status not updated
- **Cause:** Limit check using wrong counts

**Scenario 3: Sequential Sending Bottleneck**
- Using `campaignService.ts` sequential sending (1 msg at a time)
- 12,000 messages at 1 msg/sec = 3.3 hours
- Only 600 sent in 25 minutes = 0.4 msgs/sec
- **Cause:** Extremely slow sequential sending

## Root Causes Identified

### 1. Count Drift from Incremental Updates ⚠️⚠️⚠️

**Location:** `campaignService.ts:1173-1211`

```typescript
// PROBLEM: Incremental updates accumulate across campaign runs
await db.update(smsCampaigns)
  .set({ sentCount: sql`${smsCampaigns.sentCount} + 1` })
  .where(eq(smsCampaigns.id, smsCampaignId));

await db.update(smsCampaigns)
  .set({ failedCount: sql`${smsCampaigns.failedCount} + 1` })
  .where(eq(smsCampaigns.id, smsCampaignId));
```

**Why This Causes Stuck:**
- Campaign #67 was run multiple times (IDs 58, 60, 61, 62, 63, 67 all named "elite")
- Each run increments the same counts
- Counts never reset between runs
- Eventually counts become meaningless
- UI shows wrong progress (45% when actually 5%)

**Impact:** HIGH - This is the primary cause

### 2. No Campaign Status Monitoring ⚠️⚠️

**Location:** `campaignService.ts:1094-1104`

```typescript
while (true) {
  // Check if campaign is still in sending status
  const [currentCampaign] = await db.select()
    .from(smsCampaigns)
    .where(eq(smsCampaigns.id, smsCampaignId));

  if (currentCampaign?.status !== 'sending') {
    console.log(`Campaign ${smsCampaignId} stopped`);
    return;
  }
  // ... send messages
}
```

**Why This Causes Stuck:**
- If sending process crashes, status stays "sending"
- No heartbeat or health check
- No timeout detection
- Campaign appears stuck forever

**Impact:** MEDIUM - Makes stuck state permanent

### 3. Sequential Sending is Too Slow ⚠️

**Location:** `campaignService.ts:1145-1213`

```typescript
for (const recipient of recipients) {
  // Send one message at a time
  await providerInstance.sendMessage(...);
  await sleep(1000 / sendingRate); // Default 1 msg/sec
}
```

**Performance:**
- 12,000 messages at 1 msg/sec = **3.3 hours**
- Actual observed: 600 in 25 minutes = **0.4 msgs/sec** (even slower!)
- With 10 phone numbers, could be **10 msgs/sec** = 20 minutes total

**Impact:** MEDIUM - Not stuck, just painfully slow

### 4. No Stuck Detection or Recovery ⚠️

**Current State:**
- No heartbeat monitoring
- No "last progress" timestamp
- No automatic recovery
- No alerts when stuck

**Impact:** MEDIUM - Can't detect or fix stuck campaigns

## Fix Scope - Prevent Stuck Campaigns

### Priority 1: Fix Count Drift (CRITICAL) 🔥

**Problem:** Counts accumulate across campaign runs
**Solution:** Reset counts on campaign start, use reconciliation

**Implementation:**

```typescript
// In startSmsCampaign() - BEFORE starting to send
export async function startSmsCampaign(smsCampaignId: number) {
  // ... existing code ...
  
  // CRITICAL FIX: Reset counts to match actual recipient statuses
  await reconcileCampaignCounts(smsCampaignId);
  
  // Set status to sending
  await db.update(smsCampaigns)
    .set({
      status: 'sending',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(smsCampaigns.id, smsCampaignId));
  
  // Start sending...
}
```

**Also Fix:** Remove incremental count updates, use reconciliation instead

```typescript
// REMOVE these incremental updates:
// await db.update(smsCampaigns)
//   .set({ sentCount: sql`${smsCampaigns.sentCount} + 1` })

// REPLACE with periodic reconciliation (already exists):
// Call reconcileCampaignCounts() every 100 messages or on completion
```

**Expected Result:**
- Counts always accurate
- No phantom progress
- UI shows real progress (5% not 45%)

**Effort:** 30 minutes
**Impact:** Fixes the root cause of stuck appearance

### Priority 2: Add Heartbeat & Stuck Detection 💓

**Problem:** No way to detect if campaign is actually stuck
**Solution:** Add heartbeat with automatic recovery

**Implementation:**

```typescript
// Add to campaignService.ts
interface CampaignHeartbeat {
  campaignId: number;
  lastProgressTime: number;
  lastSentCount: number;
  lastFailedCount: number;
}

const campaignHeartbeats = new Map<number, CampaignHeartbeat>();

// In sendCampaignMessages() loop
async function sendCampaignMessages(...) {
  // Initialize heartbeat
  campaignHeartbeats.set(smsCampaignId, {
    campaignId: smsCampaignId,
    lastProgressTime: Date.now(),
    lastSentCount: 0,
    lastFailedCount: 0,
  });
  
  while (true) {
    // ... existing code ...
    
    // Update heartbeat every batch
    const heartbeat = campaignHeartbeats.get(smsCampaignId);
    if (heartbeat) {
      heartbeat.lastProgressTime = Date.now();
      heartbeat.lastSentCount = currentCampaign.sentCount || 0;
      heartbeat.lastFailedCount = currentCampaign.failedCount || 0;
    }
    
    // ... send messages ...
  }
  
  // Clean up
  campaignHeartbeats.delete(smsCampaignId);
}

// Background monitor (runs every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [campaignId, heartbeat] of campaignHeartbeats.entries()) {
    const timeSinceProgress = now - heartbeat.lastProgressTime;
    
    // If no progress in 5 minutes, mark as stuck
    if (timeSinceProgress > 5 * 60 * 1000) {
      console.error(`[CampaignMonitor] Campaign ${campaignId} STUCK - no progress in 5 minutes`);
      
      // Auto-recovery: reconcile counts and mark as paused
      reconcileCampaignCounts(campaignId, { status: 'paused' })
        .then(() => {
          console.log(`[CampaignMonitor] Campaign ${campaignId} auto-paused - click Resume to continue`);
        });
      
      campaignHeartbeats.delete(campaignId);
    }
  }
}, 30000); // Check every 30 seconds
```

**Expected Result:**
- Detects stuck campaigns within 5 minutes
- Auto-pauses with accurate counts
- User can resume from UI

**Effort:** 1 hour
**Impact:** Prevents permanent stuck state

### Priority 3: Add Campaign Timeout ⏱️

**Problem:** Campaigns can run indefinitely
**Solution:** Add maximum runtime with graceful completion

**Implementation:**

```typescript
// In sendCampaignMessages()
async function sendCampaignMessages(...) {
  const MAX_RUNTIME_MS = 4 * 60 * 60 * 1000; // 4 hours max
  const startTime = Date.now();
  
  while (true) {
    // Check timeout
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`Campaign ${smsCampaignId} reached max runtime (4 hours) - completing`);
      await reconcileCampaignCounts(smsCampaignId, { 
        status: 'completed', 
        completedAt: new Date() 
      });
      return;
    }
    
    // ... existing code ...
  }
}
```

**Expected Result:**
- Campaigns never run forever
- Graceful completion after 4 hours
- Accurate final counts

**Effort:** 15 minutes
**Impact:** Prevents infinite hangs

### Priority 4: Switch to Batch SMS Service 🚀

**Problem:** Sequential sending is too slow (0.4 msgs/sec)
**Solution:** Use existing batchSmsService for parallel sending

**Implementation:**

```typescript
// In startSmsCampaign() - REPLACE sequential sending
// BEFORE:
sendCampaignMessages(smsCampaignId, campaign, account, provider)
  .catch(error => { /* handle */ });

// AFTER:
import { batchSmsService } from './batchSmsService';

// Get all phone numbers for this account
const phoneNumbers = await getAccountPhoneNumbers(account.id);

// Get pending recipients
const recipients = await db.select()
  .from(campaignRecipients)
  .where(and(
    eq(campaignRecipients.smsCampaignId, smsCampaignId),
    eq(campaignRecipients.status, 'pending')
  ));

// Start batch sending (parallel across all numbers)
await batchSmsService.startBatchAsync({
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
    apiKey: pn.apiKey,
    apiSecret: pn.apiSecret,
    commioAccountId: pn.commioAccountId,
  })),
  campaignId: smsCampaignId,
  userId: campaign.userId,
  concurrentPerNumber: 10, // 10 parallel requests per number
  totalCampaignRecipients: campaign.recipientCount,
});
```

**Expected Result:**
- 12,000 messages in 20 minutes (vs 3.3 hours)
- 10 msgs/sec (vs 0.4 msgs/sec)
- **25x faster**

**Effort:** 2 hours
**Impact:** Eliminates slow sending bottleneck

### Priority 5: Add Progress Persistence 💾

**Problem:** Progress lost if server crashes
**Solution:** Persist progress more frequently

**Implementation:**

```typescript
// In sendCampaignMessages() - add periodic reconciliation
let messagesSinceLastReconcile = 0;

for (const recipient of recipients) {
  // ... send message ...
  
  messagesSinceLastReconcile++;
  
  // Reconcile every 100 messages to ensure accuracy
  if (messagesSinceLastReconcile >= 100) {
    await reconcileCampaignCounts(smsCampaignId);
    messagesSinceLastReconcile = 0;
  }
}
```

**Expected Result:**
- Counts stay accurate during sending
- No drift accumulation
- Better crash recovery

**Effort:** 15 minutes
**Impact:** Prevents count drift during long runs

## Implementation Plan

### Phase 1: Critical Fixes (1 hour) 🔥

1. **Reset counts on campaign start** (30 min)
   - Call `reconcileCampaignCounts()` before starting
   - Ensures counts match reality

2. **Add heartbeat monitoring** (30 min)
   - Detect stuck campaigns
   - Auto-pause after 5 minutes of no progress

### Phase 2: Reliability (1.5 hours) 💪

3. **Add campaign timeout** (15 min)
   - Maximum 4-hour runtime
   - Graceful completion

4. **Add progress persistence** (15 min)
   - Reconcile every 100 messages
   - Prevent drift during sending

5. **Remove incremental count updates** (1 hour)
   - Replace with reconciliation
   - Eliminate drift source

### Phase 3: Performance (2 hours) 🚀

6. **Switch to batch SMS service** (2 hours)
   - Parallel sending
   - 25x faster
   - Better progress tracking

## Expected Results

### Before Fixes
- ❌ Campaign stuck at 45% (wrong progress)
- ❌ Counts drift across runs (5,442 vs 600)
- ❌ No stuck detection (stuck forever)
- ❌ Slow sending (0.4 msgs/sec)
- ❌ No recovery mechanism

### After Phase 1 (1 hour)
- ✅ Accurate progress (5% not 45%)
- ✅ Stuck detection (auto-pause after 5 min)
- ✅ Counts reset on start
- ⚠️ Still slow (0.4 msgs/sec)

### After Phase 2 (2.5 hours)
- ✅ Accurate progress
- ✅ Stuck detection & auto-recovery
- ✅ No count drift
- ✅ 4-hour timeout
- ⚠️ Still slow

### After Phase 3 (4.5 hours)
- ✅ Accurate progress
- ✅ Stuck detection & auto-recovery
- ✅ No count drift
- ✅ Fast sending (10 msgs/sec)
- ✅ 12,000 messages in 20 minutes

## Immediate Action for Current Stuck Campaign

**Fix Campaign #67 Now:**

```sql
-- Reset counts to match reality
UPDATE sms_campaigns 
SET sent_count = 400, 
    failed_count = 200, 
    updated_at = NOW() 
WHERE id = 67;

-- Optionally pause it so user can restart fresh
UPDATE sms_campaigns 
SET status = 'paused', 
    updated_at = NOW() 
WHERE id = 67;
```

**Then user can:**
1. Refresh page to see accurate 5% progress (600/12,000)
2. Click Resume to continue sending
3. Campaign will send remaining 11,400 messages

## Summary

**Root Cause:** Count drift from incremental updates across campaign runs
**Symptom:** Shows 45% (5,442) when actually 5% (600)
**Why Stuck:** Sending process likely stopped but status not updated
**Fix Priority:** Reset counts on start + heartbeat monitoring
**Total Effort:** 1 hour for critical fixes, 4.5 hours for complete solution
**Expected Impact:** Campaigns never get stuck, always show accurate progress
