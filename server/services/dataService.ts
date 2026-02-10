/**
 * Data Service - Account-Scoped Data Access Layer
 * 
 * This service provides account-isolated data access for all communication data.
 * It ensures multi-tenant security by filtering all queries by accountId.
 * 
 * Key principles:
 * 1. All data queries MUST go through this service
 * 2. Account context is required for all operations
 * 3. Overview mode aggregates across all user's accounts
 */

import { providerFactory, type ProviderCode, type ProviderAnalytics, type Message, type Call } from '../providers';
import { accountService } from './accountService';
import { cacheService } from './cacheService';
import { redisService, CacheKeys, CACHE_TTL, STALE_TTL } from './redisService';
import { db } from '../db';
import { smsMessages, voiceCalls, accounts } from '../../shared/schema';
import { eq, and, gte, lte, desc, count, sql, or, isNull, inArray } from 'drizzle-orm';

export interface DataContext {
  userId: number;
  accountId?: string | number;  // null/undefined = overview mode
  isOverviewMode: boolean;
}

export interface AccountAnalytics {
  accountId: string;
  accountName: string;
  provider: ProviderCode;
  analytics: ProviderAnalytics;
}

export interface AggregatedMetrics {
  totalMessagesSentToday: number;
  totalMessagesSentThisWeek: number;
  totalMessagesSentThisMonth: number;
  totalMessagesReceivedToday: number;
  totalCallsToday: number;
  totalCallsThisWeek: number;
  totalCallDurationToday: number;
  totalSpendToday: number;
  totalSpendThisWeek: number;
  totalSpendThisMonth: number;
  deliveryRate: number;
  failureRate: number;
  totalPhoneNumbers: number;
  totalAccounts: number;
}

export interface DataServiceResult {
  context: DataContext;
  accounts: AccountAnalytics[];
  aggregatedMetrics: AggregatedMetrics;
  messages: {
    today: Message[];
    thisWeek: Message[];
    thisMonth: Message[];
  };
  calls: {
    today: Call[];
    thisWeek: Call[];
    thisMonth: Call[];
  };
}

/**
 * Data Service Class
 * 
 * Provides account-scoped data access with support for:
 * - Single account mode: Returns data for specific account
 * - Overview mode: Aggregates data across all user's accounts
 */
class DataService {
  
  /**
   * Get analytics data based on context
   * 
   * @param context - User and account context
   * @returns Analytics data scoped to the context
   */
  async getAnalytics(context: DataContext): Promise<DataServiceResult> {
    const { userId, accountId, isOverviewMode } = context;

    // Use consistent cache key with getAnalyticsFast
    const cacheKey = isOverviewMode 
      ? CacheKeys.aggregatedMetrics(userId)
      : CacheKeys.analytics(accountId || userId);
    
    // Check Redis cache first (with stale-while-revalidate)
    if (redisService.isAvailable()) {
      const { data: cached, isStale } = await redisService.getWithStale<DataServiceResult>(cacheKey);
      if (cached) {
        console.log(`[DataService] Redis cache ${isStale ? 'STALE' : 'HIT'} for:`, cacheKey);
        return cached;
      }
    }
    
    // Fallback to in-memory cache
    const memCached = cacheService.get<DataServiceResult>(cacheKey);
    if (memCached) {
      console.log('[DataService] Memory cache HIT for:', cacheKey);
      return memCached;
    }

    console.log('[DataService] getAnalytics called with:', { userId, accountId, isOverviewMode });

    // Get all accounts for user
    const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
    
    console.log('[DataService] Found accounts:', userAccounts.length);
    
    if (userAccounts.length === 0) {
      console.log('[DataService] No accounts found, using fallback');
      return this.getFallbackAnalytics(context);
    }

    // Determine which accounts to fetch
    let accountsToFetch = userAccounts;
    
    if (!isOverviewMode && accountId) {
      // Normalize account ID for comparison
      const normalizedId = String(accountId).replace('acc_', '');
      accountsToFetch = userAccounts.filter(a => {
        const accId = String(a.id).replace('acc_', '');
        return accId === normalizedId || String(a.id) === String(accountId);
      });
      console.log('[DataService] Filtering for account:', accountId, '-> found:', accountsToFetch.map(a => a.name));
    }

    // Fetch analytics for each account in parallel for speed
    const accountAnalytics: AccountAnalytics[] = [];
    
    const fetchPromises = accountsToFetch.map(async (account) => {
      try {
        const numericId = parseInt(String(account.id).replace('acc_', ''));
        if (isNaN(numericId)) return null;

        const provider = await accountService.getProviderForAccount(numericId);
        if (!provider) return null;

        console.log('[DataService] Fetching analytics from provider:', provider.code, 'for account:', account.name);
        const analytics = await provider.getAnalytics();
        
        return {
          accountId: account.id,
          accountName: account.name,
          provider: provider.code,
          analytics,
          numericId,
        } as AccountAnalytics & { numericId: number };
      } catch (error) {
        console.error(`[DataService] Error fetching analytics for account ${account.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(result => {
      if (result) accountAnalytics.push(result);
    });

    // Supplement provider API data with database-stored messages and imported phone numbers
    await this.supplementWithDbData(accountAnalytics, accountsToFetch);

    // Aggregate metrics across all fetched accounts
    const aggregatedMetrics = this.aggregateMetrics(accountAnalytics);

    // Merge messages and calls from all accounts
    const messages = this.mergeMessages(accountAnalytics);
    const calls = this.mergeCalls(accountAnalytics);

    const result: DataServiceResult = {
      context,
      accounts: accountAnalytics,
      aggregatedMetrics,
      messages,
      calls,
    };

    // Cache the result in Redis (primary) and memory (fallback)
    if (redisService.isAvailable()) {
      await redisService.set(cacheKey, result, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
      console.log('[DataService] Redis cached for:', cacheKey);
    }
    cacheService.set(cacheKey, result, 5 * 60 * 1000);

    return result;
  }

  /**
   * Get analytics for a specific account by ID
   */
  async getAccountAnalytics(accountId: number): Promise<ProviderAnalytics | null> {
    try {
      const provider = await accountService.getProviderForAccount(accountId);
      if (!provider) return null;
      
      return await provider.getAnalytics();
    } catch (error) {
      console.error(`Error fetching analytics for account ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Fallback to environment-based Twilio config
   */
  private async getFallbackAnalytics(context: DataContext): Promise<DataServiceResult> {
    console.log('[DataService] Using FALLBACK analytics (env-based Twilio)');
    const provider = providerFactory.createFromEnv();
    
    if (!provider) {
      console.log('[DataService] No env provider available, returning empty result');
      return this.getEmptyResult(context);
    }

    try {
      console.log('[DataService] Fetching from env-based provider:', provider.code);
      const analytics = await provider.getAnalytics();
      console.log('[DataService] Fallback got analytics:', {
        messagesThisMonth: analytics.messages.thisMonth.length,
        callsThisMonth: analytics.calls.thisMonth.length,
      });
      
      const accountAnalytics: AccountAnalytics[] = [{
        accountId: 'acc_master_twilio',
        accountName: 'Main Twilio Account',
        provider: 'twilio',
        analytics,
      }];

      return {
        context,
        accounts: accountAnalytics,
        aggregatedMetrics: this.aggregateMetrics(accountAnalytics),
        messages: {
          today: analytics.messages.today,
          thisWeek: analytics.messages.thisWeek,
          thisMonth: analytics.messages.thisMonth,
        },
        calls: {
          today: analytics.calls.today,
          thisWeek: analytics.calls.thisWeek,
          thisMonth: analytics.calls.thisMonth,
        },
      };
    } catch (error) {
      console.error('Error fetching fallback analytics:', error);
      return this.getEmptyResult(context);
    }
  }

  /**
   * Return empty result structure
   */
  private getEmptyResult(context: DataContext): DataServiceResult {
    return {
      context,
      accounts: [],
      aggregatedMetrics: {
        totalMessagesSentToday: 0,
        totalMessagesSentThisWeek: 0,
        totalMessagesSentThisMonth: 0,
        totalMessagesReceivedToday: 0,
        totalCallsToday: 0,
        totalCallsThisWeek: 0,
        totalCallDurationToday: 0,
        totalSpendToday: 0,
        totalSpendThisWeek: 0,
        totalSpendThisMonth: 0,
        deliveryRate: 100,
        failureRate: 0,
        totalPhoneNumbers: 0,
        totalAccounts: 0,
      },
      messages: { today: [], thisWeek: [], thisMonth: [] },
      calls: { today: [], thisWeek: [], thisMonth: [] },
    };
  }

  /**
   * Supplement provider API data with database-stored messages and imported phone numbers.
   * This is critical for Commio where ThinQ API doesn't expose message history endpoints,
   * and for any provider where batch-sent messages are stored locally in sms_messages table.
   */
  private async supplementWithDbData(accountAnalytics: AccountAnalytics[], accountsToFetch: any[]): Promise<void> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(startOfDay);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const lastWeekStart = new Date(startOfWeek);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(startOfWeek);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      for (const accAnalytics of accountAnalytics) {
        const numericId = parseInt(String(accAnalytics.accountId).replace('acc_', ''));
        if (isNaN(numericId)) continue;

        // Check if provider API returned empty messages (common for Commio)
        const apiMessageCount = (accAnalytics.analytics.messages?.all?.length || 0) +
          (accAnalytics.analytics.messages?.thisMonth?.length || 0);

        // Load DB messages for this account
        const dbMessages = await db
          .select()
          .from(smsMessages)
          .where(
            and(
              eq(smsMessages.accountId, numericId),
              gte(smsMessages.sentAt, sixMonthsAgo)
            )
          )
          .orderBy(desc(smsMessages.sentAt))
          .limit(5000);

        if (dbMessages.length > 0) {
          console.log(`[DataService] DB supplement for account ${accAnalytics.accountId}: ${dbMessages.length} messages (API had ${apiMessageCount})`);

          // Convert DB messages to Message format
          const dbMsgFormatted: Message[] = dbMessages.map(m => ({
            sid: m.messageSid || `db_${m.id}`,
            from: m.from,
            to: m.to,
            body: m.body,
            status: m.status as any,
            direction: m.direction as any,
            dateSent: m.sentAt.toISOString(),
            dateCreated: (m.createdAt || m.sentAt).toISOString(),
          }));

          // Merge with existing API messages (deduplicate by sid)
          const existingSids = new Set<string>();
          const allPeriods = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'all'] as const;
          for (const period of allPeriods) {
            const msgs = (accAnalytics.analytics.messages as any)[period];
            if (Array.isArray(msgs)) {
              msgs.forEach((m: any) => { if (m.sid) existingSids.add(m.sid); });
            }
          }

          // Filter out duplicates
          const newMessages = dbMsgFormatted.filter(m => !existingSids.has(m.sid));

          if (newMessages.length > 0) {
            // Filter into time periods
            const filterByPeriod = (msgs: Message[], start: Date, end: Date) =>
              msgs.filter(m => { const d = new Date(m.dateSent); return d >= start && d < end; });

            const dbToday = filterByPeriod(newMessages, startOfDay, now);
            const dbYesterday = filterByPeriod(newMessages, yesterday, startOfDay);
            const dbThisWeek = filterByPeriod(newMessages, startOfWeek, now);
            const dbLastWeek = filterByPeriod(newMessages, lastWeekStart, lastWeekEnd);
            const dbThisMonth = filterByPeriod(newMessages, startOfMonth, now);
            const dbLastMonth = filterByPeriod(newMessages, lastMonth, endOfLastMonth);

            // Merge into analytics
            const msgs = accAnalytics.analytics.messages as any;
            msgs.today = [...(msgs.today || []), ...dbToday].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.yesterday = [...(msgs.yesterday || []), ...dbYesterday].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.thisWeek = [...(msgs.thisWeek || []), ...dbThisWeek].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.lastWeek = [...(msgs.lastWeek || []), ...dbLastWeek].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.thisMonth = [...(msgs.thisMonth || []), ...dbThisMonth].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.lastMonth = [...(msgs.lastMonth || []), ...dbLastMonth].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            msgs.all = [...(msgs.all || []), ...newMessages].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());

            // Recalculate metrics with merged data
            const outboundToday = msgs.today.filter((m: any) => m.direction?.startsWith('outbound'));
            const outboundMonth = msgs.thisMonth.filter((m: any) => m.direction?.startsWith('outbound'));
            const inboundToday = msgs.today.filter((m: any) => m.direction === 'inbound');
            const deliveredMonth = outboundMonth.filter((m: any) => m.status === 'delivered' || m.status === 'sent').length;
            const failedMonth = outboundMonth.filter((m: any) => m.status === 'failed' || m.status === 'undelivered').length;

            const metrics = accAnalytics.analytics.metrics;
            metrics.totalMessagesSentToday = outboundToday.length;
            metrics.totalMessagesReceivedToday = inboundToday.length;
            metrics.totalMessagesSentThisWeek = msgs.thisWeek.filter((m: any) => m.direction?.startsWith('outbound')).length;
            metrics.totalMessagesSentThisMonth = outboundMonth.length;
            if (metrics.totalMessagesSentYesterday !== undefined) {
              metrics.totalMessagesSentYesterday = (msgs.yesterday || []).filter((m: any) => m.direction?.startsWith('outbound')).length;
            }
            metrics.deliveryRate = outboundMonth.length > 0 ? (deliveredMonth / outboundMonth.length) * 100 : 100;
            metrics.failureRate = outboundMonth.length > 0 ? (failedMonth / outboundMonth.length) * 100 : 0;

            console.log(`[DataService] Updated metrics for ${accAnalytics.accountId}: sent today=${metrics.totalMessagesSentToday}, month=${metrics.totalMessagesSentThisMonth}`);
          }
        }

        // Supplement phone numbers from imported numbers (for Commio accounts)
        if (accAnalytics.analytics.phoneNumbers.length === 0) {
          try {
            const accountData = await accountService.getAccountById(numericId);
            if (accountData) {
              const settings = (accountData.settings || {}) as Record<string, any>;
              if (settings.importedPhoneNumbers && Array.isArray(settings.importedPhoneNumbers)) {
                accAnalytics.analytics.phoneNumbers = settings.importedPhoneNumbers.map((pn: any) => ({
                  sid: pn.phoneNumber,
                  phoneNumber: pn.phoneNumber,
                  friendlyName: pn.friendlyName || pn.phoneNumber,
                  capabilities: pn.capabilities || { sms: true, voice: true, mms: false },
                  status: 'active',
                  dateCreated: pn.dateCreated || new Date().toISOString(),
                  a2pStatus: 'registered' as const,
                }));
                console.log(`[DataService] Loaded ${accAnalytics.analytics.phoneNumbers.length} imported phone numbers for ${accAnalytics.accountId}`);
              }
            }
          } catch (err) {
            console.error(`[DataService] Error loading imported numbers for ${accAnalytics.accountId}:`, err);
          }
        }
      }

      // Also load messages with no accountId (historical synced messages) and attribute them
      const [untaggedCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(smsMessages)
        .where(
          and(
            isNull(smsMessages.accountId),
            gte(smsMessages.sentAt, sixMonthsAgo)
          )
        );

      if (untaggedCount.count > 0 && accountAnalytics.length > 0) {
        console.log(`[DataService] Found ${untaggedCount.count} untagged messages, loading for dashboard`);
        
        const untaggedMessages = await db
          .select()
          .from(smsMessages)
          .where(
            and(
              isNull(smsMessages.accountId),
              gte(smsMessages.sentAt, sixMonthsAgo)
            )
          )
          .orderBy(desc(smsMessages.sentAt))
          .limit(5000);

        if (untaggedMessages.length > 0) {
          // Add untagged messages to the first Twilio account (most likely source)
          const twilioAccount = accountAnalytics.find(a => a.provider === 'twilio') || accountAnalytics[0];
          
          const untaggedFormatted: Message[] = untaggedMessages.map(m => ({
            sid: m.messageSid || `db_${m.id}`,
            from: m.from,
            to: m.to,
            body: m.body,
            status: m.status as any,
            direction: m.direction as any,
            dateSent: m.sentAt.toISOString(),
            dateCreated: (m.createdAt || m.sentAt).toISOString(),
          }));

          // Deduplicate against existing
          const existingSids = new Set<string>();
          const msgs = twilioAccount.analytics.messages as any;
          ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'all'].forEach(period => {
            (msgs[period] || []).forEach((m: any) => { if (m.sid) existingSids.add(m.sid); });
          });

          const newUntagged = untaggedFormatted.filter(m => !existingSids.has(m.sid));
          if (newUntagged.length > 0) {
            msgs.all = [...(msgs.all || []), ...newUntagged].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            
            // Also add to thisMonth if applicable
            const monthMsgs = newUntagged.filter(m => new Date(m.dateSent) >= startOfMonth);
            if (monthMsgs.length > 0) {
              msgs.thisMonth = [...(msgs.thisMonth || []), ...monthMsgs].sort((a: any, b: any) => new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime());
            }
            console.log(`[DataService] Added ${newUntagged.length} untagged messages to ${twilioAccount.accountId}`);
          }
        }
      }
    } catch (error) {
      console.error('[DataService] Error supplementing with DB data:', error);
    }
  }

  /**
   * Aggregate metrics across multiple accounts
   */
  private aggregateMetrics(accounts: AccountAnalytics[]): AggregatedMetrics {
    const initial: AggregatedMetrics = {
      totalMessagesSentToday: 0,
      totalMessagesSentThisWeek: 0,
      totalMessagesSentThisMonth: 0,
      totalMessagesReceivedToday: 0,
      totalCallsToday: 0,
      totalCallsThisWeek: 0,
      totalCallDurationToday: 0,
      totalSpendToday: 0,
      totalSpendThisWeek: 0,
      totalSpendThisMonth: 0,
      deliveryRate: 0,
      failureRate: 0,
      totalPhoneNumbers: 0,
      totalAccounts: accounts.length,
    };

    if (accounts.length === 0) {
      initial.deliveryRate = 100;
      return initial;
    }

    let totalDeliveryRate = 0;
    let totalFailureRate = 0;

    for (const account of accounts) {
      const m = account.analytics.metrics;
      
      initial.totalMessagesSentToday += m.totalMessagesSentToday;
      initial.totalMessagesSentThisWeek += m.totalMessagesSentThisWeek;
      initial.totalMessagesSentThisMonth += m.totalMessagesSentThisMonth;
      initial.totalMessagesReceivedToday += m.totalMessagesReceivedToday;
      initial.totalCallsToday += m.totalCallsToday;
      initial.totalCallsThisWeek += m.totalCallsThisWeek;
      initial.totalCallDurationToday += m.totalCallDurationToday;
      initial.totalSpendToday += m.totalSpendToday;
      initial.totalSpendThisWeek += m.totalSpendThisWeek;
      initial.totalSpendThisMonth += m.totalSpendThisMonth;
      initial.totalPhoneNumbers += account.analytics.phoneNumbers.length;
      
      totalDeliveryRate += m.deliveryRate;
      totalFailureRate += m.failureRate;
    }

    // Average delivery/failure rates
    initial.deliveryRate = totalDeliveryRate / accounts.length;
    initial.failureRate = totalFailureRate / accounts.length;

    return initial;
  }

  /**
   * Merge messages from multiple accounts, sorted by date
   */
  private mergeMessages(accounts: AccountAnalytics[]): {
    today: Message[];
    yesterday: Message[];
    thisWeek: Message[];
    lastWeek: Message[];
    thisMonth: Message[];
    lastMonth: Message[];
    all: Message[];
  } {
    const today: Message[] = [];
    const yesterday: Message[] = [];
    const thisWeek: Message[] = [];
    const lastWeek: Message[] = [];
    const thisMonth: Message[] = [];
    const lastMonth: Message[] = [];
    const all: Message[] = [];

    for (const account of accounts) {
      // Add account context to each message
      const addContext = (msgs: Message[] | undefined) => (msgs || []).map(m => ({
        ...m,
        _accountId: account.accountId,
        _accountName: account.accountName,
      }));

      today.push(...addContext(account.analytics.messages.today));
      yesterday.push(...addContext((account.analytics.messages as any).yesterday));
      thisWeek.push(...addContext(account.analytics.messages.thisWeek));
      lastWeek.push(...addContext((account.analytics.messages as any).lastWeek));
      thisMonth.push(...addContext(account.analytics.messages.thisMonth));
      lastMonth.push(...addContext((account.analytics.messages as any).lastMonth));
      all.push(...addContext((account.analytics.messages as any).all));
    }

    // Sort by date descending
    const sortByDate = (a: Message, b: Message) => 
      new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime();

    return {
      today: today.sort(sortByDate),
      yesterday: yesterday.sort(sortByDate),
      thisWeek: thisWeek.sort(sortByDate),
      lastWeek: lastWeek.sort(sortByDate),
      thisMonth: thisMonth.sort(sortByDate),
      lastMonth: lastMonth.sort(sortByDate),
      all: all.sort(sortByDate),
    };
  }

  /**
   * Merge calls from multiple accounts, sorted by date
   */
  private mergeCalls(accounts: AccountAnalytics[]): {
    today: Call[];
    yesterday: Call[];
    thisWeek: Call[];
    lastWeek: Call[];
    thisMonth: Call[];
    lastMonth: Call[];
    all: Call[];
  } {
    const today: Call[] = [];
    const yesterday: Call[] = [];
    const thisWeek: Call[] = [];
    const lastWeek: Call[] = [];
    const thisMonth: Call[] = [];
    const lastMonth: Call[] = [];
    const all: Call[] = [];

    for (const account of accounts) {
      // Add account context to each call
      const addContext = (calls: Call[] | undefined) => (calls || []).map(c => ({
        ...c,
        _accountId: account.accountId,
        _accountName: account.accountName,
      }));

      today.push(...addContext(account.analytics.calls.today));
      yesterday.push(...addContext((account.analytics.calls as any).yesterday));
      thisWeek.push(...addContext(account.analytics.calls.thisWeek));
      lastWeek.push(...addContext((account.analytics.calls as any).lastWeek));
      thisMonth.push(...addContext(account.analytics.calls.thisMonth));
      lastMonth.push(...addContext((account.analytics.calls as any).lastMonth));
      all.push(...addContext((account.analytics.calls as any).all));
    }

    // Sort by date descending
    const sortByDate = (a: Call, b: Call) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime();

    return {
      today: today.sort(sortByDate),
      yesterday: yesterday.sort(sortByDate),
      thisWeek: thisWeek.sort(sortByDate),
      lastWeek: lastWeek.sort(sortByDate),
      thisMonth: thisMonth.sort(sortByDate),
      lastMonth: lastMonth.sort(sortByDate),
      all: all.sort(sortByDate),
    };
  }

  /**
   * Send a message through the appropriate provider
   */
  async sendMessage(
    accountId: number,
    options: { to: string; from: string; body: string; mediaUrls?: string[] }
  ) {
    const provider = await accountService.getProviderForAccount(accountId);
    if (!provider) {
      throw new Error('Account not found or not configured');
    }

    return provider.sendMessage(options);
  }

  /**
   * Make a call through the appropriate provider
   */
  async makeCall(
    accountId: number,
    options: { to: string; from: string; url?: string; twiml?: string }
  ) {
    const provider = await accountService.getProviderForAccount(accountId);
    if (!provider) {
      throw new Error('Account not found or not configured');
    }

    return provider.makeCall(options);
  }

  /**
   * Get analytics from local database with Redis caching (FAST PATH)
   * This is the primary method for dashboard - queries local DB instead of external APIs
   */
  async getAnalyticsFast(context: DataContext): Promise<DataServiceResult> {
    const { userId, accountId, isOverviewMode } = context;
    const cacheKey = isOverviewMode 
      ? CacheKeys.aggregatedMetrics(userId)
      : CacheKeys.analytics(accountId || userId);

    // Try Redis cache first with stale-while-revalidate
    if (redisService.isAvailable()) {
      const { data: cached, isStale } = await redisService.getWithStale<DataServiceResult>(cacheKey);
      
      if (cached) {
        console.log(`[DataService] Cache ${isStale ? 'STALE' : 'HIT'} for:`, cacheKey);
        
        // If stale, trigger background refresh but return cached data immediately
        if (isStale) {
          this.refreshAnalyticsInBackground(context, cacheKey);
        }
        
        return cached;
      }
    }

    console.log('[DataService] Cache MISS, querying database for:', cacheKey);

    // Query local database
    const result = await this.queryLocalDatabase(context);

    // Cache the result
    if (redisService.isAvailable()) {
      await redisService.set(cacheKey, result, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
    }

    return result;
  }

  /**
   * Query analytics from local PostgreSQL database
   */
  private async queryLocalDatabase(context: DataContext): Promise<DataServiceResult> {
    const { userId, accountId, isOverviewMode } = context;
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    try {
      // Get accounts for user
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      
      // Determine which account IDs to query
      let accountIds: number[] = [];
      if (isOverviewMode) {
        accountIds = userAccounts.map(a => {
          const id = String(a.id).replace('acc_', '');
          return parseInt(id);
        }).filter(id => !isNaN(id));
      } else if (accountId) {
        const id = parseInt(String(accountId).replace('acc_', ''));
        if (!isNaN(id)) accountIds = [id];
      }

      if (accountIds.length === 0) {
        // Fallback to external API if no local accounts
        return this.getAnalytics(context);
      }

      // Query messages from database
      const messagesQuery = db
        .select()
        .from(smsMessages)
        .where(
          and(
            sql`${smsMessages.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
            gte(smsMessages.sentAt, sixMonthsAgo)
          )
        )
        .orderBy(desc(smsMessages.sentAt))
        .limit(10000);

      // Query calls from database
      const callsQuery = db
        .select()
        .from(voiceCalls)
        .where(
          and(
            sql`${voiceCalls.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
            gte(voiceCalls.startTime, sixMonthsAgo)
          )
        )
        .orderBy(desc(voiceCalls.startTime))
        .limit(5000);

      const [dbMessages, dbCalls] = await Promise.all([messagesQuery, callsQuery]);

      console.log(`[DataService] Database query: ${dbMessages.length} messages, ${dbCalls.length} calls`);

      // If no local data, fall back to external API to fetch from Twilio/Commio/Bandwidth
      if (dbMessages.length === 0 && dbCalls.length === 0) {
        console.log('[DataService] No local data found, fetching from external APIs...');
        const result = await this.getAnalytics(context);
        
        // Cache the result from external API so subsequent requests are instant
        const cacheKey = isOverviewMode 
          ? CacheKeys.aggregatedMetrics(userId)
          : CacheKeys.analytics(accountId || userId);
        if (redisService.isAvailable()) {
          await redisService.set(cacheKey, result, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
          console.log('[DataService] Cached external API result for:', cacheKey);
        }
        
        return result;
      }

      // Convert to Message/Call format
      const allMessages: Message[] = dbMessages.map(m => ({
        sid: m.messageSid || `msg_${m.id}`,
        from: m.from,
        to: m.to,
        body: m.body,
        status: m.status as any,
        direction: m.direction as any,
        dateSent: m.sentAt.toISOString(),
        dateCreated: m.sentAt.toISOString(),
      }));

      const allCalls: Call[] = dbCalls.map(c => ({
        sid: c.callSid || `call_${c.id}`,
        from: c.from,
        to: c.to,
        status: c.status as any,
        direction: c.direction as any,
        duration: String(c.duration || 0),
        startTime: c.startTime.toISOString(),
        endTime: c.endTime?.toISOString(),
      }));

      // Filter by time periods
      const messagesToday = allMessages.filter(m => new Date(m.dateSent) >= startOfDay);
      const messagesThisWeek = allMessages.filter(m => new Date(m.dateSent) >= startOfWeek);
      const messagesThisMonth = allMessages.filter(m => new Date(m.dateSent) >= startOfMonth);

      const callsToday = allCalls.filter(c => new Date(c.startTime) >= startOfDay);
      const callsThisWeek = allCalls.filter(c => new Date(c.startTime) >= startOfWeek);
      const callsThisMonth = allCalls.filter(c => new Date(c.startTime) >= startOfMonth);

      // Calculate metrics
      const outboundMonth = messagesThisMonth.filter(m => m.direction?.startsWith('outbound'));
      const deliveredMonth = outboundMonth.filter(m => m.status === 'delivered').length;
      const failedMonth = outboundMonth.filter(m => m.status === 'failed' || m.status === 'undelivered').length;

      const aggregatedMetrics: AggregatedMetrics = {
        totalMessagesSentToday: messagesToday.filter(m => m.direction?.startsWith('outbound')).length,
        totalMessagesSentThisWeek: messagesThisWeek.filter(m => m.direction?.startsWith('outbound')).length,
        totalMessagesSentThisMonth: outboundMonth.length,
        totalMessagesReceivedToday: messagesToday.filter(m => m.direction === 'inbound').length,
        totalCallsToday: callsToday.length,
        totalCallsThisWeek: callsThisWeek.length,
        totalCallDurationToday: callsToday.reduce((sum, c) => sum + parseInt(c.duration || '0'), 0),
        totalSpendToday: 0,
        totalSpendThisWeek: 0,
        totalSpendThisMonth: 0,
        deliveryRate: outboundMonth.length > 0 ? (deliveredMonth / outboundMonth.length) * 100 : 100,
        failureRate: outboundMonth.length > 0 ? (failedMonth / outboundMonth.length) * 100 : 0,
        totalPhoneNumbers: 0,
        totalAccounts: accountIds.length,
      };

      // Build account analytics structure
      const accountAnalytics: AccountAnalytics[] = userAccounts
        .filter(a => {
          const id = parseInt(String(a.id).replace('acc_', ''));
          return accountIds.includes(id);
        })
        .map(a => ({
          accountId: a.id,
          accountName: a.name,
          provider: (a.provider || 'twilio') as ProviderCode,
          analytics: {
            account: { sid: a.id, friendlyName: a.name, status: 'active', type: 'Full', dateCreated: '', dateUpdated: '' },
            phoneNumbers: [],
            messages: {
              today: messagesToday,
              yesterday: [],
              thisWeek: messagesThisWeek,
              lastWeek: [],
              thisMonth: messagesThisMonth,
              lastMonth: [],
              all: allMessages,
            },
            calls: {
              today: callsToday,
              yesterday: [],
              thisWeek: callsThisWeek,
              lastWeek: [],
              thisMonth: callsThisMonth,
              lastMonth: [],
              all: allCalls,
            },
            usage: [],
            metrics: {
              totalMessagesSentToday: aggregatedMetrics.totalMessagesSentToday,
              totalMessagesSentThisWeek: aggregatedMetrics.totalMessagesSentThisWeek,
              totalMessagesSentThisMonth: aggregatedMetrics.totalMessagesSentThisMonth,
              totalMessagesReceivedToday: aggregatedMetrics.totalMessagesReceivedToday,
              totalCallsToday: aggregatedMetrics.totalCallsToday,
              totalCallsThisWeek: aggregatedMetrics.totalCallsThisWeek,
              totalCallDurationToday: aggregatedMetrics.totalCallDurationToday,
              totalSpendToday: 0,
              totalSpendThisWeek: 0,
              totalSpendThisMonth: 0,
              deliveryRate: aggregatedMetrics.deliveryRate,
              failureRate: aggregatedMetrics.failureRate,
            },
          },
        }));

      return {
        context,
        accounts: accountAnalytics,
        aggregatedMetrics,
        messages: {
          today: messagesToday,
          thisWeek: messagesThisWeek,
          thisMonth: messagesThisMonth,
        },
        calls: {
          today: callsToday,
          thisWeek: callsThisWeek,
          thisMonth: callsThisMonth,
        },
      };
    } catch (error) {
      console.error('[DataService] Database query error, falling back to API:', error);
      // Fallback to external API
      return this.getAnalytics(context);
    }
  }

  /**
   * Refresh analytics in background (stale-while-revalidate pattern)
   */
  private async refreshAnalyticsInBackground(context: DataContext, cacheKey: string): Promise<void> {
    // Don't await - run in background
    setImmediate(async () => {
      try {
        console.log('[DataService] Background refresh for:', cacheKey);
        const result = await this.queryLocalDatabase(context);
        await redisService.set(cacheKey, result, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
        console.log('[DataService] Background refresh complete for:', cacheKey);
      } catch (error) {
        console.error('[DataService] Background refresh failed:', error);
      }
    });
  }

  /**
   * Get pre-computed chart data from cache
   */
  async getChartData(accountId: number | string): Promise<any | null> {
    const cacheKey = CacheKeys.chartData(accountId, '6m');
    
    if (redisService.isAvailable()) {
      const cached = await redisService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // If not cached, return null - chart data should be pre-computed by background jobs
    return null;
  }
}

export const dataService = new DataService();
