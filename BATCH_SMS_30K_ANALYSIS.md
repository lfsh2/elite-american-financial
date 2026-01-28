# Batch SMS Sending - 30K Contacts Analysis

## Current Implementation Review

### ✅ What Works Well

#### 1. **Round-Robin Distribution**
- Recipients are distributed evenly across multiple phone numbers
- Each number has a configurable limit (default: 2000 messages/number)
- For 30k contacts with 15 numbers = 2,000 messages per number

#### 2. **Drip Mode Support**
- Sequential sending with configurable delays
- Default: 30 messages/minute = 1 message every 2 seconds
- Prevents carrier filtering and number flagging

#### 3. **Parallel Processing**
- Multiple phone numbers send simultaneously
- Each number processes its queue independently
- Configurable concurrency per number (default: 20 concurrent requests)

#### 4. **Memory Management**
- Recipients are distributed into queues upfront
- Processing happens in batches
- Database inserts happen per message (not bulk)

---

## 30K Contacts Scalability Analysis

### Scenario: 30,000 Contacts

#### **Configuration Options:**

**Option 1: High-Speed Parallel Mode (No Drip)**
- Phone numbers needed: 15 numbers (2,000 msgs each)
- Concurrency per number: 20
- Estimated time: ~15-20 minutes
- Risk: Higher chance of carrier filtering

**Option 2: Safe Drip Mode**
- Phone numbers needed: 15 numbers
- Messages per minute: 30 per number
- Total throughput: 450 messages/minute (15 numbers × 30 msgs/min)
- Estimated time: ~67 minutes (30,000 ÷ 450)
- Risk: Very low carrier filtering risk

**Option 3: Balanced Approach**
- Phone numbers: 15 numbers
- Messages per minute: 60 per number (moderate speed)
- Total throughput: 900 messages/minute
- Estimated time: ~33 minutes
- Risk: Low to moderate

---

## ⚠️ Potential Issues & Bottlenecks

### 1. **Memory Concerns**
**Issue:** Loading all 30k recipients into memory at once
```typescript
// Current: Loads all recipients
const recipients = recipientsData.recipients || [];
```

**Impact:** 
- 30k recipients × ~500 bytes/recipient = ~15MB in memory
- Acceptable for Node.js, but not optimal

**Solution:** Implement pagination/streaming (see recommendations)

---

### 2. **Database Performance**
**Issue:** Individual INSERT per message (30k inserts)
```typescript
await db.insert(smsMessages).values({...}); // Called 30k times
```

**Impact:**
- 30k individual database writes
- Potential bottleneck and slow performance
- Could take 10-30 seconds just for DB writes

**Solution:** Batch database inserts (see recommendations)

---

### 3. **API Request Timeout**
**Issue:** Single HTTP request for entire batch
```typescript
const batchRes = await fetch('/api/sms/batch', {...});
```

**Impact:**
- Request could timeout before completion
- No progress updates during sending
- Frontend waits for entire batch to complete

**Solution:** Implement SSE (Server-Sent Events) for real-time progress

---

### 4. **Error Recovery**
**Issue:** If process crashes mid-send, no resume capability
- No tracking of which messages were sent
- Would need to resend entire campaign

**Solution:** Track sent messages in campaign_recipients table

---

### 5. **Rate Limiting**
**Issue:** Carrier rate limits per number
- Twilio: ~1 message/second per number (safe)
- Commio: Similar limits
- Sending too fast = number flagged/suspended

**Current Protection:** Drip mode with configurable rate
**Status:** ✅ Already handled

---

## 📋 Recommendations for 30K Contacts

### Priority 1: Critical for Production

#### 1. **Implement Batch Database Inserts**
```typescript
// Instead of 30k individual inserts
const messageBatch = [];
for (const recipient of batch) {
  const result = await sendMessage(recipient);
  messageBatch.push({
    userId,
    messageSid: result.messageSid,
    from: phoneConfig.phoneNumber,
    to: recipient.phone,
    body: personalizedMessage,
    status: result.success ? 'sent' : 'failed',
    direction: 'outbound-api',
    sentAt: new Date(),
    createdAt: new Date(),
  });
  
  // Flush every 100 messages
  if (messageBatch.length >= 100) {
    await db.insert(smsMessages).values(messageBatch);
    messageBatch.length = 0;
  }
}
```

#### 2. **Add Progress Tracking with SSE**
```typescript
// Server: Stream progress updates
app.get("/api/sms/batch/progress/:jobId", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  // Send progress updates every second
});

// Frontend: Listen to progress
const eventSource = new EventSource(`/api/sms/batch/progress/${jobId}`);
eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  updateProgressUI(progress);
};
```

#### 3. **Implement Background Job Processing**
```typescript
// Use BullMQ for background jobs
const job = await batchSmsQueue.add('send-campaign', {
  campaignId,
  recipients,
  phoneNumbers,
  options,
});

// Return job ID immediately
res.json({ jobId: job.id, status: 'queued' });
```

---

### Priority 2: Performance Optimization

#### 4. **Paginate Recipient Fetching**
```typescript
// Fetch recipients in chunks
const CHUNK_SIZE = 1000;
for (let offset = 0; offset < totalRecipients; offset += CHUNK_SIZE) {
  const recipients = await db
    .select()
    .from(campaignRecipients)
    .where(eq(campaignRecipients.smsCampaignId, campaignId))
    .limit(CHUNK_SIZE)
    .offset(offset);
  
  await processChunk(recipients);
}
```

#### 5. **Add Campaign Resume Capability**
```typescript
// Track sent status in campaign_recipients
await db
  .update(campaignRecipients)
  .set({ 
    status: 'sent',
    messageSid: result.messageSid,
    sentAt: new Date(),
  })
  .where(eq(campaignRecipients.id, recipientId));

// Resume from last sent
const unsent = await db
  .select()
  .from(campaignRecipients)
  .where(and(
    eq(campaignRecipients.smsCampaignId, campaignId),
    eq(campaignRecipients.status, 'pending')
  ));
```

---

### Priority 3: Monitoring & Safety

#### 6. **Add Rate Limit Monitoring**
```typescript
// Track sending rate per number
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(phoneNumber: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const timestamps = rateLimiter.get(phoneNumber) || [];
  
  // Remove timestamps older than 1 minute
  const recent = timestamps.filter(t => now - t < 60000);
  
  if (recent.length >= maxPerMinute) {
    return false; // Rate limit exceeded
  }
  
  recent.push(now);
  rateLimiter.set(phoneNumber, recent);
  return true;
}
```

#### 7. **Add Error Rate Monitoring**
```typescript
// Stop campaign if error rate too high
const errorRate = (failed / (sent + failed)) * 100;
if (errorRate > 10 && sent > 100) {
  console.error(`[BatchSMS] High error rate: ${errorRate}%, stopping campaign`);
  throw new Error('Campaign stopped due to high error rate');
}
```

---

## 🎯 Recommended Configuration for 30K Contacts

### **Safe Production Setup:**

```typescript
{
  recipients: 30000,
  phoneNumbers: 15,              // 2,000 messages per number
  dripMode: true,                // Enable drip mode
  messagesPerMinute: 40,         // 40 msgs/min per number
  concurrentPerNumber: 1,        // Sequential in drip mode
  
  // Calculated metrics:
  totalThroughput: 600,          // 15 numbers × 40 msgs/min
  estimatedTime: 50,             // 30,000 ÷ 600 = 50 minutes
  riskLevel: 'Low',              // Safe sending rate
}
```

### **Fast Production Setup:**

```typescript
{
  recipients: 30000,
  phoneNumbers: 20,              // 1,500 messages per number
  dripMode: true,
  messagesPerMinute: 60,         // 60 msgs/min per number
  concurrentPerNumber: 1,
  
  // Calculated metrics:
  totalThroughput: 1200,         // 20 numbers × 60 msgs/min
  estimatedTime: 25,             // 30,000 ÷ 1,200 = 25 minutes
  riskLevel: 'Low-Medium',
}
```

---

## ✅ Current Status: Can Handle 30K

### **Yes, the system CAN handle 30k contacts, BUT:**

1. ✅ **Distribution works** - Round-robin across multiple numbers
2. ✅ **Drip mode works** - Rate limiting prevents flagging
3. ✅ **Merge tags work** - Custom fields supported
4. ⚠️ **Database writes slow** - Need batch inserts
5. ⚠️ **No progress updates** - Need SSE implementation
6. ⚠️ **No resume capability** - Need status tracking
7. ⚠️ **Memory inefficient** - Should paginate recipients

---

## 🚀 Next Steps

### Immediate (Required for 30K):
1. Implement batch database inserts (100 messages at a time)
2. Add SSE progress tracking
3. Move to background job processing with BullMQ

### Short-term (Performance):
4. Paginate recipient fetching
5. Add campaign resume capability
6. Implement rate limit monitoring

### Long-term (Enterprise):
7. Add error rate monitoring and auto-pause
8. Implement retry logic for failed messages
9. Add detailed analytics and reporting

---

## 📊 Performance Estimates

| Contacts | Numbers | Rate (msg/min/num) | Total Throughput | Time | DB Writes Time |
|----------|---------|-------------------|------------------|------|----------------|
| 1,000    | 5       | 30                | 150/min          | 7min | ~3s            |
| 5,000    | 10      | 40                | 400/min          | 13min| ~15s           |
| 10,000   | 10      | 60                | 600/min          | 17min| ~30s           |
| 30,000   | 15      | 40                | 600/min          | 50min| ~90s           |
| 30,000   | 20      | 60                | 1200/min         | 25min| ~90s           |
| 50,000   | 25      | 60                | 1500/min         | 33min| ~150s          |

*Note: DB write times assume individual inserts. Batch inserts would reduce to <10s.*

---

## 💡 Conclusion

**Current system can handle 30K contacts with these caveats:**

✅ **Works:** Distribution, drip mode, merge tags, provider support
⚠️ **Needs improvement:** Database performance, progress tracking, error handling
🔧 **Recommended:** Implement batch DB inserts and SSE before production use

**Estimated time for 30K contacts:** 25-50 minutes depending on configuration
**Recommended phone numbers:** 15-20 numbers
**Recommended rate:** 40-60 messages/minute per number
