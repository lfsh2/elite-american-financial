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

    // Get all accounts for user
    const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
    
    if (userAccounts.length === 0) {
      // Fallback to env-based Twilio if no accounts in DB
      return this.getFallbackAnalytics(context);
    }

    // Determine which accounts to fetch
    const accountsToFetch = isOverviewMode || !accountId
      ? userAccounts
      : userAccounts.filter(a => a.id === accountId || a.id === `acc_${accountId}`);

    // Fetch analytics for each account
    const accountAnalytics: AccountAnalytics[] = [];
    
    for (const account of accountsToFetch) {
      try {
        // Parse numeric ID
        const numericId = parseInt(String(account.id).replace('acc_', ''));
        if (isNaN(numericId)) continue;

        const provider = await accountService.getProviderForAccount(numericId);
        if (!provider) continue;

        const analytics = await provider.getAnalytics();
        
        accountAnalytics.push({
          accountId: account.id,
          accountName: account.name,
          provider: provider.code,
          analytics,
        });
      } catch (error) {
        console.error(`Error fetching analytics for account ${account.id}:`, error);
      }
    }

    // Aggregate metrics across all fetched accounts
    const aggregatedMetrics = this.aggregateMetrics(accountAnalytics);

    // Merge messages and calls from all accounts
    const messages = this.mergeMessages(accountAnalytics);
    const calls = this.mergeCalls(accountAnalytics);

    return {
      context,
      accounts: accountAnalytics,
      aggregatedMetrics,
      messages,
      calls,
    };
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
    const provider = providerFactory.createFromEnv();
    
    if (!provider) {
      return this.getEmptyResult(context);
    }

    try {
      const analytics = await provider.getAnalytics();
      
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
    thisWeek: Message[];
    thisMonth: Message[];
  } {
    const today: Message[] = [];
    const thisWeek: Message[] = [];
    const thisMonth: Message[] = [];

    for (const account of accounts) {
      // Add account context to each message
      const addContext = (msgs: Message[]) => msgs.map(m => ({
        ...m,
        _accountId: account.accountId,
        _accountName: account.accountName,
      }));

      today.push(...addContext(account.analytics.messages.today));
      thisWeek.push(...addContext(account.analytics.messages.thisWeek));
      thisMonth.push(...addContext(account.analytics.messages.thisMonth));
    }

    // Sort by date descending
    const sortByDate = (a: Message, b: Message) => 
      new Date(b.dateSent).getTime() - new Date(a.dateSent).getTime();

    return {
      today: today.sort(sortByDate),
      thisWeek: thisWeek.sort(sortByDate),
      thisMonth: thisMonth.sort(sortByDate),
    };
  }

  /**
   * Merge calls from multiple accounts, sorted by date
   */
  private mergeCalls(accounts: AccountAnalytics[]): {
    today: Call[];
    thisWeek: Call[];
    thisMonth: Call[];
  } {
    const today: Call[] = [];
    const thisWeek: Call[] = [];
    const thisMonth: Call[] = [];

    for (const account of accounts) {
      // Add account context to each call
      const addContext = (calls: Call[]) => calls.map(c => ({
        ...c,
        _accountId: account.accountId,
        _accountName: account.accountName,
      }));

      today.push(...addContext(account.analytics.calls.today));
      thisWeek.push(...addContext(account.analytics.calls.thisWeek));
      thisMonth.push(...addContext(account.analytics.calls.thisMonth));
    }

    // Sort by date descending
    const sortByDate = (a: Call, b: Call) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime();

    return {
      today: today.sort(sortByDate),
      thisWeek: thisWeek.sort(sortByDate),
      thisMonth: thisMonth.sort(sortByDate),
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
}

export const dataService = new DataService();
