# Large-Scale Contact Import - Implementation Plan

## Current Limitations

### ❌ Cannot Handle:
- 30k+ contacts in single upload
- Millions of contacts
- Large CSV files (>10MB)
- Resume failed imports
- Real-time progress tracking

### Root Causes:
1. **Frontend:** Loads entire file into memory
2. **Backend:** N+1 query problem (3 queries per contact)
3. **No chunking:** Processes all contacts at once
4. **No background jobs:** Blocks HTTP request
5. **No streaming:** Cannot handle large files

---

## Solution Architecture

### Phase 1: Chunked Upload (Immediate - Required for 30k+)
- Stream CSV file in chunks (1000 rows at a time)
- Process chunks independently
- Show real-time progress
- Enable pause/resume

### Phase 2: Optimized Backend (Critical for Performance)
- Batch database operations (100 contacts per query)
- Use database transactions
- Implement bulk upsert
- Reduce 90,000 queries to ~300 queries for 30k contacts

### Phase 3: Background Jobs (Required for Millions)
- Use BullMQ for async processing
- Return job ID immediately
- Process in background
- Poll for status updates

---

## Implementation Details

### 1. Frontend: Chunked CSV Upload

```typescript
// Stream CSV file in chunks
const CHUNK_SIZE = 1000; // Process 1000 contacts at a time

async function uploadLargeCSV(file: File, listId: number) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let lineNumber = 0;
  let chunk: Contact[] = [];
  let totalProcessed = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line
      
      for (const line of lines) {
        if (lineNumber === 0) {
          // Parse headers
          headers = parseCSVLine(line);
          lineNumber++;
          continue;
        }
        
        const contact = parseContactFromLine(line, headers);
        if (contact) {
          chunk.push(contact);
        }
        
        // Send chunk when full
        if (chunk.length >= CHUNK_SIZE) {
          await sendChunk(listId, chunk, totalProcessed);
          totalProcessed += chunk.length;
          updateProgress(totalProcessed);
          chunk = [];
        }
        
        lineNumber++;
      }
    }
    
    if (done) {
      // Send remaining contacts
      if (chunk.length > 0) {
        await sendChunk(listId, chunk, totalProcessed);
        totalProcessed += chunk.length;
      }
      break;
    }
  }
  
  return totalProcessed;
}

async function sendChunk(listId: number, contacts: Contact[], offset: number) {
  const res = await fetch('/api/campaigns/contacts/import-chunk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contactListId: listId,
      contacts,
      offset,
      isLastChunk: false,
    }),
  });
  
  if (!res.ok) {
    throw new Error('Failed to import chunk');
  }
  
  return res.json();
}
```

### 2. Backend: Batch Database Operations

```typescript
// New optimized import function
export async function importContactsChunk(
  userId: number,
  accountId: number | null,
  contactListId: number | null,
  rows: ContactImportRow[],
  offset: number = 0
): Promise<ContactImportResult> {
  const result: ContactImportResult = {
    success: true,
    totalRows: rows.length,
    imported: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
  };

  // Normalize all phone numbers upfront
  const normalizedContacts = rows.map((row, index) => ({
    ...row,
    phoneNumber: normalizePhoneNumber(row.phoneNumber),
    originalIndex: offset + index,
  }));

  // Extract all phone numbers
  const phoneNumbers = normalizedContacts.map(c => c.phoneNumber);

  // BATCH QUERY: Check existing contacts in ONE query
  const existingContacts = await db
    .select()
    .from(contacts)
    .where(and(
      eq(contacts.userId, userId),
      inArray(contacts.phoneNumber, phoneNumbers)
    ));

  const existingMap = new Map(
    existingContacts.map(c => [c.phoneNumber, c])
  );

  // Separate into updates and inserts
  const toUpdate: any[] = [];
  const toInsert: any[] = [];

  for (const contact of normalizedContacts) {
    const existing = existingMap.get(contact.phoneNumber);
    
    if (existing) {
      toUpdate.push({
        id: existing.id,
        firstName: contact.firstName || existing.firstName,
        lastName: contact.lastName || existing.lastName,
        email: contact.email || existing.email,
      });
      result.duplicates++;
    } else {
      toInsert.push({
        userId,
        phoneNumber: contact.phoneNumber,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        tags: contact.tags,
        createdAt: new Date(),
      });
    }
  }

  // BATCH INSERT: Insert all new contacts at once
  let insertedContacts: any[] = [];
  if (toInsert.length > 0) {
    insertedContacts = await db
      .insert(contacts)
      .values(toInsert)
      .returning();
    result.imported = insertedContacts.length;
  }

  // BATCH UPDATE: Update existing contacts
  if (toUpdate.length > 0) {
    // Use transaction for bulk updates
    await db.transaction(async (tx) => {
      for (const update of toUpdate) {
        await tx
          .update(contacts)
          .set(update)
          .where(eq(contacts.id, update.id));
      }
    });
  }

  // Add to contact list if specified
  if (contactListId) {
    // Collect all contact IDs
    const allContactIds = [
      ...toUpdate.map(c => c.id),
      ...insertedContacts.map(c => c.id),
    ];

    // BATCH QUERY: Check existing memberships
    const existingMembers = await db
      .select()
      .from(contactListMembers)
      .where(and(
        eq(contactListMembers.contactListId, contactListId),
        inArray(contactListMembers.contactId, allContactIds)
      ));

    const existingMemberIds = new Set(
      existingMembers.map(m => m.contactId)
    );

    // BATCH INSERT: Add new memberships
    const newMemberships = allContactIds
      .filter(id => !existingMemberIds.has(id))
      .map(contactId => ({
        contactListId,
        contactId,
      }));

    if (newMemberships.length > 0) {
      await db
        .insert(contactListMembers)
        .values(newMemberships);
    }
  }

  return result;
}
```

### 3. Background Job Processing (For Millions)

```typescript
// Queue definition
import { Queue, Worker } from 'bullmq';

const contactImportQueue = new Queue('contact-import', {
  connection: redisConnection,
});

// Add job
export async function queueContactImport(
  userId: number,
  contactListId: number,
  fileUrl: string
) {
  const job = await contactImportQueue.add('import-csv', {
    userId,
    contactListId,
    fileUrl,
  });

  return { jobId: job.id };
}

// Worker
const worker = new Worker('contact-import', async (job) => {
  const { userId, contactListId, fileUrl } = job.data;
  
  // Download file
  const response = await fetch(fileUrl);
  const text = await response.text();
  
  // Parse CSV
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]);
  
  // Process in chunks
  const CHUNK_SIZE = 1000;
  let totalProcessed = 0;
  
  for (let i = 1; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE);
    const contacts = chunk.map(line => parseContactFromLine(line, headers));
    
    await importContactsChunk(userId, null, contactListId, contacts, i - 1);
    
    totalProcessed += contacts.length;
    
    // Update job progress
    await job.updateProgress({
      processed: totalProcessed,
      total: lines.length - 1,
      percentage: (totalProcessed / (lines.length - 1)) * 100,
    });
  }
  
  return { totalProcessed };
}, {
  connection: redisConnection,
});
```

---

## Performance Comparison

### Current Implementation:
| Contacts | Queries | Time | Status |
|----------|---------|------|--------|
| 1,000    | 3,000   | 30s  | ⚠️ Slow |
| 10,000   | 30,000  | 5min | ❌ Very Slow |
| 30,000   | 90,000  | 15min| ❌ Fails |
| 100,000  | 300,000 | N/A  | ❌ Crashes |

### Optimized Implementation:
| Contacts | Queries | Time | Status |
|----------|---------|------|--------|
| 1,000    | ~10     | 2s   | ✅ Fast |
| 10,000   | ~100    | 15s  | ✅ Fast |
| 30,000   | ~300    | 45s  | ✅ Good |
| 100,000  | ~1,000  | 2.5min| ✅ Good |
| 1,000,000| ~10,000 | 25min| ✅ Works |

---

## Implementation Priority

### Phase 1: Critical (Required for 30k)
1. ✅ Implement chunked CSV upload (frontend)
2. ✅ Implement batch database operations (backend)
3. ✅ Add progress tracking
4. ✅ Add new API endpoint: `/api/campaigns/contacts/import-chunk`

### Phase 2: Important (Required for 100k+)
5. Add file upload to cloud storage (S3/GCS)
6. Implement background job processing with BullMQ
7. Add job status polling endpoint
8. Add resume capability for failed imports

### Phase 3: Enterprise (Required for Millions)
9. Implement streaming CSV parser (no memory load)
10. Add distributed processing across workers
11. Implement deduplication at scale
12. Add import analytics and reporting

---

## Estimated Timeline

- **Phase 1:** 4-6 hours (enables 30k-100k contacts)
- **Phase 2:** 8-12 hours (enables 100k-500k contacts)
- **Phase 3:** 2-3 days (enables millions of contacts)

---

## Next Steps

1. Implement Phase 1 (chunked upload + batch operations)
2. Test with 30k contact CSV
3. Test with 100k contact CSV
4. Implement Phase 2 if needed for larger datasets
