/**
 * Phone Number Health Check Service
 * 
 * Provides comprehensive health monitoring for phone numbers across
 * multiple providers (Twilio, Commio). Calculates health scores based on:
 * - Provider API status
 * - Recent delivery rates
 * - Activity patterns
 * - Configuration completeness
 */

import { db } from '../db';
import { accounts, providers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import Twilio from 'twilio';
import { CommioProvider } from '../providers/commio.provider';
import { TwilioProvider } from '../providers/twilio.provider';

export interface PhoneNumberHealth {
  phoneNumber: string;
  friendlyName: string;
  provider: 'twilio' | 'commio';
  accountId: string;
  accountName: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  metrics: {
    apiStatus: 'active' | 'inactive' | 'unknown';
    deliveryRate: number | null;
    lastActivity: Date | null;
    errorCount: number;
    capabilities: {
      voice: boolean;
      sms: boolean;
      mms: boolean;
    };
    configurationComplete: boolean;
  };
  issues: string[];
  lastChecked: Date;
}

export interface HealthCheckSummary {
  totalNumbers: number;
  byProvider: {
    twilio: number;
    commio: number;
  };
  byStatus: {
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
  };
  averageHealthScore: number;
  phoneNumbers: PhoneNumberHealth[];
}

interface ActivityMetrics {
  deliveryRate: number | null;
  lastActivity: Date | null;
  errorCount: number;
}

export class PhoneHealthService {
  /**
   * Get comprehensive health check for all phone numbers
   */
  async getHealthCheck(userId: number, accountId?: number): Promise<HealthCheckSummary> {
    const accountsToCheck = await this.getAccountsForUser(userId, accountId);
    
    const allHealthChecks: PhoneNumberHealth[] = [];
    
    // Process each account in parallel
    await Promise.all(
      accountsToCheck.map(async (account) => {
        try {
          const healthChecks = await this.checkAccountPhoneNumbers(account);
          allHealthChecks.push(...healthChecks);
        } catch (error) {
          console.error(`[PhoneHealth] Error checking account ${account.id}:`, error);
        }
      })
    );

    return this.buildSummary(allHealthChecks);
  }

  /**
   * Get health check for a specific phone number
   */
  async getPhoneNumberHealth(
    phoneNumber: string,
    accountId: number
  ): Promise<PhoneNumberHealth | null> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) return null;

    try {
      const provider = await this.getProvider(account);
      const phoneNumbers = await provider.getPhoneNumbers();
      const targetNumber = phoneNumbers.find(
        pn => pn.phoneNumber === phoneNumber || pn.sid === phoneNumber
      );

      if (!targetNumber) return null;

      const activityMetrics = await this.getActivityMetrics(
        phoneNumber,
        accountId,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        new Date()
      );

      const providerCode = await this.getProviderCode(account);
      return this.calculateHealth(
        targetNumber,
        providerCode as 'twilio' | 'commio',
        account.id.toString(),
        account.name,
        activityMetrics
      );
    } catch (error) {
      console.error(`[PhoneHealth] Error checking number ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Refresh health check for specific account
   */
  async refreshAccountHealth(accountId: number): Promise<PhoneNumberHealth[]> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) return [];

    return this.checkAccountPhoneNumbers(account);
  }

  /**
   * Get accounts for user (with optional filter)
   */
  private async getAccountsForUser(userId: number, accountId?: number) {
    if (accountId) {
      return db.select()
        .from(accounts)
        .where(eq(accounts.id, accountId));
    }

    // Get all accounts for user (you may need to adjust based on your schema)
    return db.select().from(accounts);
  }

  /**
   * Check all phone numbers for a specific account
   */
  private async checkAccountPhoneNumbers(
    account: typeof accounts.$inferSelect
  ): Promise<PhoneNumberHealth[]> {
    if (!account.accountSid || !account.authToken) {
      return [];
    }

    try {
      const provider = await this.getProvider(account);
      const phoneNumbers = await provider.getPhoneNumbers();

      // Calculate activity metrics for the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const now = new Date();

      const providerCode = await this.getProviderCode(account);

      // Process phone numbers in parallel
      const healthChecks = await Promise.all(
        phoneNumbers.map(async (phoneNumber) => {
          const activityMetrics = await this.getActivityMetrics(
            phoneNumber.phoneNumber,
            account.id,
            sevenDaysAgo,
            now
          );

          return this.calculateHealth(
            phoneNumber,
            providerCode as 'twilio' | 'commio',
            account.id.toString(),
            account.name,
            activityMetrics
          );
        })
      );

      return healthChecks;
    } catch (error) {
      console.error(`[PhoneHealth] Error checking account ${account.id}:`, error);
      return [];
    }
  }

  /**
   * Get provider code for an account
   */
  private async getProviderCode(account: typeof accounts.$inferSelect): Promise<string> {
    const [provider] = await db.select()
      .from(providers)
      .where(eq(providers.id, account.providerId));
    
    return provider?.code || 'twilio';
  }

  /**
   * Get provider instance based on account
   */
  private async getProvider(account: typeof accounts.$inferSelect) {
    const providerCode = await this.getProviderCode(account);
    
    if (providerCode === 'commio') {
      return new CommioProvider({
        accountSid: account.accountSid!,
        authToken: account.authToken!,
        apiKey: account.apiKey,
      });
    } else {
      return new TwilioProvider({
        accountSid: account.accountSid!,
        authToken: account.authToken!,
      });
    }
  }

  /**
   * Get activity metrics for a phone number
   */
  private async getActivityMetrics(
    phoneNumber: string,
    accountId: number,
    startDate: Date,
    endDate: Date
  ): Promise<ActivityMetrics> {
    try {
      // Query messages from database for this phone number
      const { messages } = await import('@shared/schema');
      
      const messageRecords = await db.select()
        .from(messages)
        .where(eq(messages.from, phoneNumber));

      // Filter by date range
      const relevantMessages = messageRecords.filter(m => {
        const sentDate = new Date(m.dateSent || m.dateCreated);
        return sentDate >= startDate && sentDate <= endDate;
      });

      if (relevantMessages.length === 0) {
        return {
          deliveryRate: null,
          lastActivity: null,
          errorCount: 0,
        };
      }

      // Calculate delivery rate
      const deliveredCount = relevantMessages.filter(
        m => m.status === 'delivered' || m.status === 'sent'
      ).length;
      const deliveryRate = (deliveredCount / relevantMessages.length) * 100;

      // Get last activity
      const lastActivity = relevantMessages.reduce((latest, msg) => {
        const msgDate = new Date(msg.dateSent || msg.dateCreated);
        return msgDate > latest ? msgDate : latest;
      }, new Date(0));

      // Count errors
      const errorCount = relevantMessages.filter(
        m => m.status === 'failed' || m.status === 'undelivered'
      ).length;

      return {
        deliveryRate,
        lastActivity: lastActivity.getTime() > 0 ? lastActivity : null,
        errorCount,
      };
    } catch (error) {
      console.error('[PhoneHealth] Error getting activity metrics:', error);
      return {
        deliveryRate: null,
        lastActivity: null,
        errorCount: 0,
      };
    }
  }

  /**
   * Calculate health score and status for a phone number
   */
  private calculateHealth(
    phoneNumber: any,
    provider: 'twilio' | 'commio',
    accountId: string,
    accountName: string,
    activityMetrics: ActivityMetrics
  ): PhoneNumberHealth {
    const issues: string[] = [];
    let healthScore = 0;

    // 1. API Status (40 points)
    const apiStatus = phoneNumber.status === 'active' ? 'active' : 
                     phoneNumber.status === 'inactive' ? 'inactive' : 'unknown';
    
    if (apiStatus === 'active') {
      healthScore += 40;
    } else if (apiStatus === 'inactive') {
      issues.push('Number is inactive in provider API');
    } else {
      issues.push('Unable to determine API status');
    }

    // 2. Delivery Rate (30 points)
    if (activityMetrics.deliveryRate !== null) {
      const deliveryScore = (activityMetrics.deliveryRate / 100) * 30;
      healthScore += deliveryScore;
      
      if (activityMetrics.deliveryRate < 95) {
        issues.push(`Low delivery rate: ${activityMetrics.deliveryRate.toFixed(1)}%`);
      }
    } else {
      // No activity data - give partial credit
      healthScore += 15;
    }

    // 3. Recent Activity (20 points)
    if (activityMetrics.lastActivity) {
      const hoursSinceActivity = (Date.now() - activityMetrics.lastActivity.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceActivity < 24) {
        healthScore += 20;
      } else if (hoursSinceActivity < 168) { // 7 days
        healthScore += 10;
      } else {
        issues.push('No activity in the last 7 days');
      }
    } else {
      issues.push('No recent activity detected');
    }

    // 4. Configuration (10 points)
    const hasVoice = phoneNumber.capabilities?.voice ?? false;
    const hasSms = phoneNumber.capabilities?.sms ?? false;
    const configurationComplete = hasVoice || hasSms;
    
    if (configurationComplete) {
      healthScore += 10;
    } else {
      issues.push('No capabilities enabled');
    }

    // 5. Error count penalty
    if (activityMetrics.errorCount > 10) {
      healthScore -= 10;
      issues.push(`High error count: ${activityMetrics.errorCount} failures`);
    } else if (activityMetrics.errorCount > 5) {
      healthScore -= 5;
      issues.push(`Moderate errors: ${activityMetrics.errorCount} failures`);
    }

    // Ensure score is within bounds
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' | 'unknown';
    if (healthScore >= 80) {
      status = 'healthy';
    } else if (healthScore >= 50) {
      status = 'warning';
    } else if (healthScore > 0) {
      status = 'critical';
    } else {
      status = 'unknown';
    }

    return {
      phoneNumber: phoneNumber.phoneNumber,
      friendlyName: phoneNumber.friendlyName || phoneNumber.phoneNumber,
      provider,
      accountId,
      accountName,
      healthScore: Math.round(healthScore),
      status,
      metrics: {
        apiStatus,
        deliveryRate: activityMetrics.deliveryRate,
        lastActivity: activityMetrics.lastActivity,
        errorCount: activityMetrics.errorCount,
        capabilities: {
          voice: phoneNumber.capabilities?.voice ?? false,
          sms: phoneNumber.capabilities?.sms ?? false,
          mms: phoneNumber.capabilities?.mms ?? false,
        },
        configurationComplete,
      },
      issues,
      lastChecked: new Date(),
    };
  }

  /**
   * Build summary from health checks
   */
  private buildSummary(healthChecks: PhoneNumberHealth[]): HealthCheckSummary {
    const summary: HealthCheckSummary = {
      totalNumbers: healthChecks.length,
      byProvider: {
        twilio: healthChecks.filter(h => h.provider === 'twilio').length,
        commio: healthChecks.filter(h => h.provider === 'commio').length,
      },
      byStatus: {
        healthy: healthChecks.filter(h => h.status === 'healthy').length,
        warning: healthChecks.filter(h => h.status === 'warning').length,
        critical: healthChecks.filter(h => h.status === 'critical').length,
        unknown: healthChecks.filter(h => h.status === 'unknown').length,
      },
      averageHealthScore: healthChecks.length > 0
        ? Math.round(
            healthChecks.reduce((sum, h) => sum + h.healthScore, 0) / healthChecks.length
          )
        : 0,
      phoneNumbers: healthChecks.sort((a, b) => a.healthScore - b.healthScore),
    };

    return summary;
  }
}

export const phoneHealthService = new PhoneHealthService();
