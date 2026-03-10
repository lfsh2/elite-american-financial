/**
 * Message Service
 * 
 * Handles all SMS message operations with database storage for scalability.
 * Replaces direct Twilio API calls with database queries + background sync.
 */

import { db } from '../db';
import { smsMessages, contacts } from '../../shared/schema';
import { eq, desc, and, gte, lte, or, sql, inArray, like } from 'drizzle-orm';

export interface MessageFilter {
  userId: number;
  accountId?: number;
  direction?: 'inbound' | 'outbound';
  status?: string;
  from?: string;
  to?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string; // For cursor-based pagination
}

export interface MessageResult {
  messages: any[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface ConversationResult {
  conversations: any[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

class MessageService {
  /**
   * Get messages with pagination - optimized for large datasets
   */
  async getMessages(
    filter: MessageFilter,
    pagination: PaginationOptions = {}
  ): Promise<MessageResult> {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    const safeLimit = Math.min(limit, 100); // Max 100 per page

    try {
      // Build where conditions
      const conditions: any[] = [eq(smsMessages.userId, filter.userId)];

      if (filter.accountId) {
        conditions.push(eq(smsMessages.accountId, filter.accountId));
      }
      if (filter.direction) {
        conditions.push(eq(smsMessages.direction, filter.direction));
      }
      if (filter.status) {
        conditions.push(eq(smsMessages.status, filter.status));
      }
      if (filter.from) {
        conditions.push(eq(smsMessages.from, filter.from));
      }
      if (filter.to) {
        conditions.push(eq(smsMessages.to, filter.to));
      }
      if (filter.startDate) {
        conditions.push(gte(smsMessages.sentAt, filter.startDate));
      }
      if (filter.endDate) {
        conditions.push(lte(smsMessages.sentAt, filter.endDate));
      }

      // Get messages with pagination
      const messages = await db
        .select()
        .from(smsMessages)
        .where(and(...conditions))
        .orderBy(desc(smsMessages.sentAt))
        .limit(safeLimit + 1) // Fetch one extra to check hasMore
        .offset(offset);

      // Check if there are more results
      const hasMore = messages.length > safeLimit;
      if (hasMore) {
        messages.pop(); // Remove the extra item
      }

      // Get total count (cached for performance)
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(smsMessages)
        .where(and(...conditions));

      const total = Number(countResult[0]?.count || 0);

      return {
        messages,
        total,
        page,
        limit: safeLimit,
        hasMore,
        nextCursor: hasMore && messages.length > 0 
          ? messages[messages.length - 1].id.toString() 
          : undefined,
      };
    } catch (error) {
      console.error('[MessageService] Error fetching messages:', error);
      return {
        messages: [],
        total: 0,
        page,
        limit: safeLimit,
        hasMore: false,
      };
    }
  }

  /**
   * Get conversations (grouped by contact) with pagination
   * Optimized for SMS inbox view
   */
  async getConversations(
    filter: MessageFilter,
    pagination: PaginationOptions = {}
  ): Promise<ConversationResult> {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    const safeLimit = Math.min(limit, 100);

    try {
      // Build where conditions
      const conditions: any[] = [eq(smsMessages.userId, filter.userId)];

      if (filter.accountId) {
        conditions.push(eq(smsMessages.accountId, filter.accountId));
      }
      if (filter.startDate) {
        conditions.push(gte(smsMessages.sentAt, filter.startDate));
      }
      if (filter.endDate) {
        conditions.push(lte(smsMessages.sentAt, filter.endDate));
      }

      // Get unique conversations grouped by contact phone
      // Using a subquery to get the latest message per conversation
      const conversations = await db.execute(sql`
        WITH ranked_messages AS (
          SELECT 
            *,
            CASE 
              WHEN direction = 'inbound' THEN "from"
              ELSE "to"
            END as contact_phone,
            ROW_NUMBER() OVER (
              PARTITION BY CASE 
                WHEN direction = 'inbound' THEN "from"
                ELSE "to"
              END 
              ORDER BY sent_at DESC
            ) as rn
          FROM sms_messages
          WHERE user_id = ${filter.userId}
          ${filter.accountId ? sql`AND account_id = ${filter.accountId}` : sql``}
          ${filter.startDate ? sql`AND sent_at >= ${filter.startDate}` : sql``}
          ${filter.endDate ? sql`AND sent_at <= ${filter.endDate}` : sql``}
        )
        SELECT 
          contact_phone,
          body as last_message,
          sent_at as last_message_time,
          direction as last_direction,
          status as last_status,
          (SELECT COUNT(*) FROM ranked_messages rm2 
           WHERE rm2.contact_phone = ranked_messages.contact_phone) as message_count,
          (SELECT COUNT(*) FROM ranked_messages rm3 
           WHERE rm3.contact_phone = ranked_messages.contact_phone 
           AND rm3.direction = 'inbound' 
           AND rm3.status != 'read') as unread_count
        FROM ranked_messages
        WHERE rn = 1
        ORDER BY sent_at DESC
        LIMIT ${safeLimit + 1}
        OFFSET ${offset}
      `);

      const rows = conversations.rows as any[];
      const hasMore = rows.length > safeLimit;
      if (hasMore) {
        rows.pop();
      }

      // Get total unique conversations count
      const countResult = await db.execute(sql`
        SELECT COUNT(DISTINCT 
          CASE 
            WHEN direction = 'inbound' THEN "from"
            ELSE "to"
          END
        ) as count
        FROM sms_messages
        WHERE user_id = ${filter.userId}
        ${filter.accountId ? sql`AND account_id = ${filter.accountId}` : sql``}
      `);

      const total = Number((countResult.rows[0] as any)?.count || 0);

      return {
        conversations: rows.map(row => ({
          contactPhone: row.contact_phone,
          lastMessage: row.last_message,
          lastMessageTime: row.last_message_time,
          lastDirection: row.last_direction,
          lastStatus: row.last_status,
          messageCount: Number(row.message_count),
          unreadCount: Number(row.unread_count),
        })),
        total,
        page,
        limit: safeLimit,
        hasMore,
      };
    } catch (error) {
      console.error('[MessageService] Error fetching conversations:', error);
      return {
        conversations: [],
        total: 0,
        page,
        limit: safeLimit,
        hasMore: false,
      };
    }
  }

  /**
   * Get messages for a specific conversation (contact)
   */
  async getConversationMessages(
    userId: number,
    contactPhone: string,
    pagination: PaginationOptions = {}
  ): Promise<MessageResult> {
    const { page = 1, limit = 50 } = pagination;
    const offset = (page - 1) * limit;
    const safeLimit = Math.min(limit, 100);

    try {
      const messages = await db
        .select()
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.userId, userId),
            or(
              eq(smsMessages.from, contactPhone),
              eq(smsMessages.to, contactPhone)
            )
          )
        )
        .orderBy(desc(smsMessages.sentAt))
        .limit(safeLimit + 1)
        .offset(offset);

      const hasMore = messages.length > safeLimit;
      if (hasMore) {
        messages.pop();
      }

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.userId, userId),
            or(
              eq(smsMessages.from, contactPhone),
              eq(smsMessages.to, contactPhone)
            )
          )
        );

      return {
        messages: messages.reverse(), // Oldest first for chat view
        total: Number(countResult[0]?.count || 0),
        page,
        limit: safeLimit,
        hasMore,
      };
    } catch (error) {
      console.error('[MessageService] Error fetching conversation messages:', error);
      return {
        messages: [],
        total: 0,
        page,
        limit: safeLimit,
        hasMore: false,
      };
    }
  }

  /**
   * Store a message in the database (for webhook handling)
   */
  async storeMessage(message: {
    userId: number;
    accountId?: number;
    to: string;
    from: string;
    body: string;
    status: string;
    direction: 'inbound' | 'outbound';
    sentAt: Date;
    messageSid?: string;
    campaignId?: number;
    mediaUrls?: string[];
    providerCode?: string;
  }): Promise<number | null> {
    try {
      // Check for duplicate by messageSid
      if (message.messageSid) {
        const existing = await db
          .select({ id: smsMessages.id })
          .from(smsMessages)
          .where(eq(smsMessages.messageSid, message.messageSid))
          .limit(1);

        if (existing.length > 0) {
          console.log(`[MessageService] Message ${message.messageSid} already exists`);
          return existing[0].id;
        }
      }

      const result = await db
        .insert(smsMessages)
        .values({
          userId: message.userId,
          accountId: message.accountId,
          to: message.to,
          from: message.from,
          body: message.body,
          status: message.status,
          direction: message.direction,
          sentAt: message.sentAt,
          messageSid: message.messageSid,
          campaignId: message.campaignId,
          mediaUrls: message.mediaUrls,
          providerCode: message.providerCode,
          price: message.price,
          priceUnit: message.priceUnit,
          segmentCount: message.segmentCount,
        })
        .returning({ id: smsMessages.id });

      console.log(`[MessageService] Stored message ${message.messageSid || 'no-sid'}`);
      return result[0]?.id || null;
    } catch (error: any) {
      // Handle unique constraint violation (duplicate messageSid)
      if (error.code === '23505') {
        console.log(`[MessageService] Duplicate message ignored: ${message.messageSid}`);
        return null;
      }
      console.error('[MessageService] Error storing message:', error);
      throw error;
    }
  }

  /**
   * Bulk store messages (for initial sync)
   */
  async bulkStoreMessages(messages: any[]): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      for (const msg of batch) {
        try {
          const result = await this.storeMessage(msg);
          if (result) {
            inserted++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }

      // Log progress for large syncs
      if (messages.length > 1000 && i % 1000 === 0) {
        console.log(`[MessageService] Sync progress: ${i}/${messages.length}`);
      }
    }

    console.log(`[MessageService] Bulk store complete: ${inserted} inserted, ${skipped} skipped`);
    return { inserted, skipped };
  }

  /**
   * Update message status (for delivery receipts)
   */
  async updateMessageStatus(messageSid: string, status: string): Promise<boolean> {
    try {
      const result = await db
        .update(smsMessages)
        .set({ status })
        .where(eq(smsMessages.messageSid, messageSid));

      return true;
    } catch (error) {
      console.error('[MessageService] Error updating message status:', error);
      return false;
    }
  }

  /**
   * Get message stats for dashboard
   */
  async getMessageStats(userId: number, accountId?: number): Promise<{
    today: number;
    thisWeek: number;
    thisMonth: number;
    inbound: number;
    outbound: number;
  }> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
      const baseConditions = accountId
        ? and(eq(smsMessages.userId, userId), eq(smsMessages.accountId, accountId))
        : eq(smsMessages.userId, userId);

      const [todayCount, weekCount, monthCount, inboundCount, outboundCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(baseConditions, gte(smsMessages.sentAt, startOfDay))),
        db.select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(baseConditions, gte(smsMessages.sentAt, startOfWeek))),
        db.select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(baseConditions, gte(smsMessages.sentAt, startOfMonth))),
        db.select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(baseConditions, eq(smsMessages.direction, 'inbound'))),
        // Handle both 'outbound' and 'outbound-api' directions from Twilio
        db.select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(baseConditions, sql`${smsMessages.direction} LIKE 'outbound%'`)),
      ]);

      return {
        today: Number(todayCount[0]?.count || 0),
        thisWeek: Number(weekCount[0]?.count || 0),
        thisMonth: Number(monthCount[0]?.count || 0),
        inbound: Number(inboundCount[0]?.count || 0),
        outbound: Number(outboundCount[0]?.count || 0),
      };
    } catch (error) {
      console.error('[MessageService] Error getting stats:', error);
      return { today: 0, thisWeek: 0, thisMonth: 0, inbound: 0, outbound: 0 };
    }
  }

  /**
   * Look up contact name by phone number
   */
  async getContactByPhone(userId: number, phoneNumber: string): Promise<{
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null> {
    try {
      // Normalize phone number for lookup (remove formatting)
      const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
      
      const result = await db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            or(
              eq(contacts.phoneNumber, phoneNumber),
              eq(contacts.phoneNumber, normalizedPhone),
              like(contacts.phoneNumber, `%${normalizedPhone.slice(-10)}`) // Match last 10 digits
            )
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('[MessageService] Error looking up contact:', error);
      return null;
    }
  }

  /**
   * Batch lookup contact names for multiple phone numbers
   */
  async getContactsByPhones(userId: number, phoneNumbers: string[]): Promise<Map<string, {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  }>> {
    const contactMap = new Map();
    
    try {
      if (phoneNumbers.length === 0) return contactMap;

      // Get all contacts for this user
      const userContacts = await db
        .select({
          phoneNumber: contacts.phoneNumber,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
        })
        .from(contacts)
        .where(eq(contacts.userId, userId));

      // Build a map for quick lookup
      for (const contact of userContacts) {
        if (contact.phoneNumber) {
          // Store by original phone number
          contactMap.set(contact.phoneNumber, {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
          });
          
          // Also store by normalized (last 10 digits)
          const normalized = contact.phoneNumber.replace(/[^\d]/g, '').slice(-10);
          if (normalized.length === 10) {
            contactMap.set(normalized, {
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
            });
          }
        }
      }

      return contactMap;
    } catch (error) {
      console.error('[MessageService] Error batch looking up contacts:', error);
      return contactMap;
    }
  }
  /**
   * Sync messages from Twilio API into database
   * Pulls historical messages and stores them for persistence
   */
  async syncMessagesFromTwilio(
    userId: number,
    accountId: number,
    accountSid: string,
    authToken: string,
    options: { days?: number; limit?: number } = {}
  ): Promise<{ inserted: number; skipped: number; errors: number }> {
    const { days = 30, limit = 1000 } = options;
    const Twilio = (await import('twilio')).default;
    const client = Twilio(accountSid, authToken);
    
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const dateSentAfter = new Date();
      dateSentAfter.setDate(dateSentAfter.getDate() - days);

      console.log(`[MessageService] Syncing Twilio messages for account ${accountId} (last ${days} days)`);

      // Fetch messages from Twilio
      const messages = await client.messages.list({
        dateSentAfter,
        limit,
      });

      console.log(`[MessageService] Found ${messages.length} messages from Twilio`);

      for (const msg of messages) {
        try {
          const result = await this.storeMessage({
            userId,
            accountId,
            to: msg.to,
            from: msg.from,
            body: msg.body || '',
            status: msg.status,
            direction: msg.direction?.includes('inbound') ? 'inbound' : 'outbound',
            sentAt: msg.dateSent || msg.dateCreated,
            messageSid: msg.sid,
            providerCode: 'twilio',
          });

          if (result) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
        }
      }

      console.log(`[MessageService] Twilio sync complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
      return { inserted, skipped, errors };
    } catch (error) {
      console.error('[MessageService] Error syncing from Twilio:', error);
      throw error;
    }
  }

  /**
   * Sync messages from Commio/ThinQ API into database
   */
  async syncMessagesFromCommio(
    userId: number,
    accountId: number,
    apiKey: string,
    apiSecret: string,
    thinqAccount: string,
    options: { days?: number; limit?: number } = {}
  ): Promise<{ inserted: number; skipped: number; errors: number }> {
    const { days = 30, limit = 1000 } = options;
    
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = new Date().toISOString().split('T')[0];

      console.log(`[MessageService] Syncing Commio messages for account ${accountId} (last ${days} days)`);

      // Fetch messages from Commio/ThinQ API
      const response = await fetch(
        `https://api.thinq.com/account/${thinqAccount}/product/origination/sms/history?start_date=${startDateStr}&end_date=${endDateStr}&limit=${limit}`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MessageService] Commio API error: ${response.status} - ${errorText}`);
        throw new Error(`Commio API error: ${response.status}`);
      }

      const data = await response.json();
      const messages = data.messages || data.data || data.results || [];

      console.log(`[MessageService] Found ${messages.length} messages from Commio`);

      for (const msg of messages) {
        try {
          const result = await this.storeMessage({
            userId,
            accountId,
            to: msg.to_did || msg.to || msg.destination,
            from: msg.from_did || msg.from || msg.source,
            body: msg.message || msg.body || msg.text || '',
            status: msg.status || 'sent',
            direction: (msg.direction === 'inbound' || msg.type === 'inbound') ? 'inbound' : 'outbound',
            sentAt: new Date(msg.created_at || msg.timestamp || msg.date),
            messageSid: msg.guid || msg.id || msg.message_id,
            providerCode: 'commio',
          });

          if (result) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
        }
      }

      console.log(`[MessageService] Commio sync complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
      return { inserted, skipped, errors };
    } catch (error) {
      console.error('[MessageService] Error syncing from Commio:', error);
      throw error;
    }
  }
}

export const messageService = new MessageService();
