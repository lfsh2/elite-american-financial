/**
 * Analytics Service
 * 
 * Provides comprehensive analytics and reporting for accounts.
 * Aggregates data from Twilio, database, and other sources.
 * 
 * Features:
 * - Account-scoped metrics
 * - Time-series data aggregation
 * - Cost breakdown by sub-account
 * - Usage trends and forecasting
 * - Export capabilities
 */

import Twilio from 'twilio';
import { db } from '../db.js';
import { 
  accounts, 
  accountPhoneNumbers,
  smsMessages,
  voiceCalls,
  type Account 
} from '../../shared/schema';
import { eq, and, gte, lte, sql, desc, count, sum } from 'drizzle-orm';

// Types
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimePeriod {
  period: 'hour' | 'day' | 'week' | 'month';
  count: number;
}

export interface UsageMetrics {
  messages: {
    sent: number;
    received: number;
    failed: number;
    total: number;
  };
  calls: {
    outbound: number;
    inbound: number;
    totalDuration: number;
    avgDuration: number;
  };
  costs: {
    messaging: number;
    voice: number;
    phoneNumbers: number;
    total: number;
  };
}

export interface TrendDataPoint {
  date: string;
  label: string;
  messages: number;
  calls: number;
  cost: number;
}

export interface AccountAnalytics {
  accountId: string;
  accountName: string;
  period: DateRange;
  metrics: UsageMetrics;
  trends: TrendDataPoint[];
  topPhoneNumbers: {
    phoneNumber: string;
    messageCount: number;
    callCount: number;
    cost: number;
  }[];
  subAccountBreakdown?: {
    accountId: string;
    accountName: string;
    metrics: UsageMetrics;
  }[];
}

export interface ReportData {
  title: string;
  generatedAt: string;
  period: DateRange;
  accounts: AccountAnalytics[];
  summary: UsageMetrics;
}

class AnalyticsService {
  
  /**
   * Get analytics for a specific account
   */
  async getAccountAnalytics(
    accountId: number,
    dateRange: DateRange
  ): Promise<AccountAnalytics> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) {
      throw new Error('Account not found');
    }

    // Get metrics from Twilio if credentials available
    let twilioMetrics: UsageMetrics | null = null;
    if (account.accountSid && account.authToken) {
      twilioMetrics = await this.getTwilioMetrics(
        account.accountSid,
        account.authToken,
        dateRange
      );
    }

    // Get database metrics
    const dbMetrics = await this.getDatabaseMetrics(accountId, dateRange);

    // Merge metrics (prefer Twilio data when available)
    const metrics = twilioMetrics || dbMetrics;

    // Get trend data
    const trends = await this.getTrendData(accountId, dateRange);

    // Get top phone numbers
    const topPhoneNumbers = await this.getTopPhoneNumbers(accountId, dateRange);

    // Get sub-account breakdown if this is a master account
    let subAccountBreakdown: AccountAnalytics['subAccountBreakdown'];
    if (account.type === 'master') {
      subAccountBreakdown = await this.getSubAccountBreakdown(accountId, dateRange);
    }

    return {
      accountId: `acc_${accountId}`,
      accountName: account.name,
      period: dateRange,
      metrics,
      trends,
      topPhoneNumbers,
      subAccountBreakdown,
    };
  }

  /**
   * Get metrics from Twilio API
   */
  private async getTwilioMetrics(
    accountSid: string,
    authToken: string,
    dateRange: DateRange
  ): Promise<UsageMetrics> {
    const client = Twilio(accountSid, authToken);

    try {
      // Get usage records
      const usageRecords = await client.usage.records.list({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      // Get message counts
      const messages = await client.messages.list({
        dateSentAfter: dateRange.startDate,
        dateSentBefore: dateRange.endDate,
        limit: 10000,
      });

      // Get call records
      const calls = await client.calls.list({
        startTimeAfter: dateRange.startDate,
        startTimeBefore: dateRange.endDate,
        limit: 5000,
      });

      // Calculate message metrics
      const sentMessages = messages.filter(m => m.direction.includes('outbound'));
      const receivedMessages = messages.filter(m => m.direction.includes('inbound'));
      const failedMessages = messages.filter(m => m.status === 'failed' || m.status === 'undelivered');

      // Calculate call metrics
      const outboundCalls = calls.filter(c => c.direction === 'outbound-api' || c.direction === 'outbound-dial');
      const inboundCalls = calls.filter(c => c.direction === 'inbound');
      const totalDuration = calls.reduce((sum, c) => sum + (parseInt(c.duration) || 0), 0);

      // Calculate costs from usage records
      let messagingCost = 0;
      let voiceCost = 0;
      let phoneNumberCost = 0;

      for (const record of usageRecords) {
        const price = parseFloat(String(record.price) || '0');
        const category = record.category;

        if (category.includes('sms') || category.includes('mms')) {
          messagingCost += price;
        } else if (category.includes('calls') || category.includes('voice')) {
          voiceCost += price;
        } else if (category.includes('phonenumbers')) {
          phoneNumberCost += price;
        }
      }

      return {
        messages: {
          sent: sentMessages.length,
          received: receivedMessages.length,
          failed: failedMessages.length,
          total: messages.length,
        },
        calls: {
          outbound: outboundCalls.length,
          inbound: inboundCalls.length,
          totalDuration,
          avgDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
        },
        costs: {
          messaging: messagingCost,
          voice: voiceCost,
          phoneNumbers: phoneNumberCost,
          total: messagingCost + voiceCost + phoneNumberCost,
        },
      };
    } catch (error) {
      console.error('Error fetching Twilio metrics:', error);
      throw error;
    }
  }

  /**
   * Get metrics from database
   */
  private async getDatabaseMetrics(
    accountId: number,
    dateRange: DateRange
  ): Promise<UsageMetrics> {
    // Get message counts - use sentAt instead of createdAt
    const messageStats = await db.select({
      direction: smsMessages.direction,
      status: smsMessages.status,
      count: count(),
    })
    .from(smsMessages)
    .where(and(
      eq(smsMessages.accountId, accountId),
      gte(smsMessages.sentAt, dateRange.startDate),
      lte(smsMessages.sentAt, dateRange.endDate)
    ))
    .groupBy(smsMessages.direction, smsMessages.status);

    // Get call stats - use startTime instead of createdAt
    const callStats = await db.select({
      direction: voiceCalls.direction,
      count: count(),
      totalDuration: sum(voiceCalls.duration),
    })
    .from(voiceCalls)
    .where(and(
      eq(voiceCalls.accountId, accountId),
      gte(voiceCalls.startTime, dateRange.startDate),
      lte(voiceCalls.startTime, dateRange.endDate)
    ))
    .groupBy(voiceCalls.direction);

    // Aggregate message stats
    let sent = 0, received = 0, failed = 0;
    for (const stat of messageStats) {
      if (stat.direction === 'outbound') sent += Number(stat.count);
      if (stat.direction === 'inbound') received += Number(stat.count);
      if (stat.status === 'failed' || stat.status === 'undelivered') failed += Number(stat.count);
    }

    // Aggregate call stats
    let outbound = 0, inbound = 0, totalDuration = 0;
    for (const stat of callStats) {
      if (stat.direction === 'outbound') outbound += Number(stat.count);
      if (stat.direction === 'inbound') inbound += Number(stat.count);
      totalDuration += Number(stat.totalDuration) || 0;
    }

    const totalCalls = outbound + inbound;

    return {
      messages: {
        sent,
        received,
        failed,
        total: sent + received,
      },
      calls: {
        outbound,
        inbound,
        totalDuration,
        avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
      },
      costs: {
        messaging: sent * 0.0079 + received * 0.0075, // Estimated costs
        voice: totalDuration * 0.014 / 60, // Per minute
        phoneNumbers: 0, // Would need to query phone numbers
        total: 0, // Will be calculated
      },
    };
  }

  /**
   * Get trend data for charts
   */
  async getTrendData(
    accountId: number,
    dateRange: DateRange,
    granularity: 'hour' | 'day' | 'week' = 'day'
  ): Promise<TrendDataPoint[]> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account?.accountSid || !account?.authToken) {
      return this.generateEmptyTrendData(dateRange, granularity);
    }

    const client = Twilio(account.accountSid, account.authToken);

    try {
      // Get messages for the period
      const messages = await client.messages.list({
        dateSentAfter: dateRange.startDate,
        dateSentBefore: dateRange.endDate,
        limit: 10000,
      });

      // Get calls for the period
      const calls = await client.calls.list({
        startTimeAfter: dateRange.startDate,
        startTimeBefore: dateRange.endDate,
        limit: 5000,
      });

      // Group by date
      const dataMap = new Map<string, TrendDataPoint>();
      
      // Initialize all dates in range
      const current = new Date(dateRange.startDate);
      while (current <= dateRange.endDate) {
        const key = this.getDateKey(current, granularity);
        const label = this.getDateLabel(current, granularity);
        dataMap.set(key, { date: key, label, messages: 0, calls: 0, cost: 0 });
        
        // Increment based on granularity
        if (granularity === 'hour') {
          current.setHours(current.getHours() + 1);
        } else if (granularity === 'day') {
          current.setDate(current.getDate() + 1);
        } else {
          current.setDate(current.getDate() + 7);
        }
      }

      // Count messages
      for (const msg of messages) {
        const key = this.getDateKey(msg.dateSent, granularity);
        const point = dataMap.get(key);
        if (point) {
          point.messages++;
          point.cost += parseFloat(String(msg.price) || '0.0079');
        }
      }

      // Count calls
      for (const call of calls) {
        const key = this.getDateKey(call.startTime, granularity);
        const point = dataMap.get(key);
        if (point) {
          point.calls++;
          point.cost += parseFloat(String(call.price) || '0');
        }
      }

      return Array.from(dataMap.values());
    } catch (error) {
      console.error('Error fetching trend data:', error);
      return this.generateEmptyTrendData(dateRange, granularity);
    }
  }

  /**
   * Get top performing phone numbers
   */
  private async getTopPhoneNumbers(
    accountId: number,
    dateRange: DateRange
  ): Promise<AccountAnalytics['topPhoneNumbers']> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account?.accountSid || !account?.authToken) {
      return [];
    }

    const client = Twilio(account.accountSid, account.authToken);

    try {
      // Get messages
      const messages = await client.messages.list({
        dateSentAfter: dateRange.startDate,
        dateSentBefore: dateRange.endDate,
        limit: 10000,
      });

      // Get calls
      const calls = await client.calls.list({
        startTimeAfter: dateRange.startDate,
        startTimeBefore: dateRange.endDate,
        limit: 5000,
      });

      // Aggregate by phone number
      const phoneStats = new Map<string, { messages: number; calls: number; cost: number }>();

      for (const msg of messages) {
        const phone = msg.from;
        const stats = phoneStats.get(phone) || { messages: 0, calls: 0, cost: 0 };
        stats.messages++;
        stats.cost += parseFloat(String(msg.price) || '0');
        phoneStats.set(phone, stats);
      }

      for (const call of calls) {
        const phone = call.from;
        const stats = phoneStats.get(phone) || { messages: 0, calls: 0, cost: 0 };
        stats.calls++;
        stats.cost += parseFloat(String(call.price) || '0');
        phoneStats.set(phone, stats);
      }

      // Sort by total activity and return top 10
      return Array.from(phoneStats.entries())
        .map(([phoneNumber, stats]) => ({
          phoneNumber,
          messageCount: stats.messages,
          callCount: stats.calls,
          cost: Math.abs(stats.cost),
        }))
        .sort((a, b) => (b.messageCount + b.callCount) - (a.messageCount + a.callCount))
        .slice(0, 10);
    } catch (error) {
      console.error('Error fetching top phone numbers:', error);
      return [];
    }
  }

  /**
   * Get breakdown by sub-account
   */
  private async getSubAccountBreakdown(
    masterAccountId: number,
    dateRange: DateRange
  ): Promise<AccountAnalytics['subAccountBreakdown']> {
    // Get all sub-accounts
    const subAccounts = await db.select()
      .from(accounts)
      .where(eq(accounts.parentAccountId, masterAccountId));

    const breakdown: AccountAnalytics['subAccountBreakdown'] = [];

    for (const subAccount of subAccounts) {
      if (subAccount.accountSid && subAccount.authToken) {
        try {
          const metrics = await this.getTwilioMetrics(
            subAccount.accountSid,
            subAccount.authToken,
            dateRange
          );

          breakdown.push({
            accountId: `acc_${subAccount.id}`,
            accountName: subAccount.name,
            metrics,
          });
        } catch (error) {
          console.error(`Error fetching metrics for sub-account ${subAccount.id}:`, error);
        }
      }
    }

    return breakdown;
  }

  /**
   * Get overview analytics for all accounts
   */
  async getOverviewAnalytics(
    organizationId: number,
    dateRange: DateRange
  ): Promise<ReportData> {
    // Get all master accounts for the organization
    const masterAccounts = await db.select()
      .from(accounts)
      .where(and(
        eq(accounts.organizationId, organizationId),
        eq(accounts.type, 'master')
      ));

    const accountAnalytics: AccountAnalytics[] = [];
    const summaryMetrics: UsageMetrics = {
      messages: { sent: 0, received: 0, failed: 0, total: 0 },
      calls: { outbound: 0, inbound: 0, totalDuration: 0, avgDuration: 0 },
      costs: { messaging: 0, voice: 0, phoneNumbers: 0, total: 0 },
    };

    for (const account of masterAccounts) {
      try {
        const analytics = await this.getAccountAnalytics(account.id, dateRange);
        accountAnalytics.push(analytics);

        // Aggregate summary
        summaryMetrics.messages.sent += analytics.metrics.messages.sent;
        summaryMetrics.messages.received += analytics.metrics.messages.received;
        summaryMetrics.messages.failed += analytics.metrics.messages.failed;
        summaryMetrics.messages.total += analytics.metrics.messages.total;
        summaryMetrics.calls.outbound += analytics.metrics.calls.outbound;
        summaryMetrics.calls.inbound += analytics.metrics.calls.inbound;
        summaryMetrics.calls.totalDuration += analytics.metrics.calls.totalDuration;
        summaryMetrics.costs.messaging += analytics.metrics.costs.messaging;
        summaryMetrics.costs.voice += analytics.metrics.costs.voice;
        summaryMetrics.costs.phoneNumbers += analytics.metrics.costs.phoneNumbers;
        summaryMetrics.costs.total += analytics.metrics.costs.total;
      } catch (error) {
        console.error(`Error fetching analytics for account ${account.id}:`, error);
      }
    }

    // Calculate average call duration
    const totalCalls = summaryMetrics.calls.outbound + summaryMetrics.calls.inbound;
    summaryMetrics.calls.avgDuration = totalCalls > 0 
      ? Math.round(summaryMetrics.calls.totalDuration / totalCalls) 
      : 0;

    return {
      title: 'Communications Analytics Report',
      generatedAt: new Date().toISOString(),
      period: dateRange,
      accounts: accountAnalytics,
      summary: summaryMetrics,
    };
  }

  /**
   * Generate CSV export data
   */
  generateCSVExport(reportData: ReportData): string {
    const lines: string[] = [];

    // Header
    lines.push('Elite Financial Analytics Report');
    lines.push(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`);
    lines.push(`Period: ${reportData.period.startDate.toLocaleDateString()} - ${reportData.period.endDate.toLocaleDateString()}`);
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('Metric,Value');
    lines.push(`Messages Sent,${reportData.summary.messages.sent}`);
    lines.push(`Messages Received,${reportData.summary.messages.received}`);
    lines.push(`Messages Failed,${reportData.summary.messages.failed}`);
    lines.push(`Total Messages,${reportData.summary.messages.total}`);
    lines.push(`Outbound Calls,${reportData.summary.calls.outbound}`);
    lines.push(`Inbound Calls,${reportData.summary.calls.inbound}`);
    lines.push(`Total Call Duration (sec),${reportData.summary.calls.totalDuration}`);
    lines.push(`Messaging Cost,$${reportData.summary.costs.messaging.toFixed(2)}`);
    lines.push(`Voice Cost,$${reportData.summary.costs.voice.toFixed(2)}`);
    lines.push(`Phone Number Cost,$${reportData.summary.costs.phoneNumbers.toFixed(2)}`);
    lines.push(`Total Cost,$${reportData.summary.costs.total.toFixed(2)}`);
    lines.push('');

    // Per-account breakdown
    lines.push('ACCOUNT BREAKDOWN');
    lines.push('Account,Messages Sent,Messages Received,Calls,Total Cost');
    for (const account of reportData.accounts) {
      const totalCalls = account.metrics.calls.outbound + account.metrics.calls.inbound;
      lines.push(`${account.accountName},${account.metrics.messages.sent},${account.metrics.messages.received},${totalCalls},$${account.metrics.costs.total.toFixed(2)}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON export data
   */
  generateJSONExport(reportData: ReportData): string {
    return JSON.stringify(reportData, null, 2);
  }

  // Helper methods
  private getDateKey(date: Date, granularity: 'hour' | 'day' | 'week'): string {
    const d = new Date(date);
    if (granularity === 'hour') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    } else if (granularity === 'day') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      // Week - use Monday as start
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  private getDateLabel(date: Date, granularity: 'hour' | 'day' | 'week'): string {
    const d = new Date(date);
    if (granularity === 'hour') {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    } else if (granularity === 'day') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
  }

  private generateEmptyTrendData(
    dateRange: DateRange,
    granularity: 'hour' | 'day' | 'week'
  ): TrendDataPoint[] {
    const data: TrendDataPoint[] = [];
    const current = new Date(dateRange.startDate);
    
    while (current <= dateRange.endDate) {
      data.push({
        date: this.getDateKey(current, granularity),
        label: this.getDateLabel(current, granularity),
        messages: 0,
        calls: 0,
        cost: 0,
      });
      
      if (granularity === 'hour') {
        current.setHours(current.getHours() + 1);
      } else if (granularity === 'day') {
        current.setDate(current.getDate() + 1);
      } else {
        current.setDate(current.getDate() + 7);
      }
    }
    
    return data;
  }
}

export const analyticsService = new AnalyticsService();
