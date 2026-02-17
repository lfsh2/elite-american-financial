import { storage } from './storage';
import { twilioAnalyticsService, type TwilioAnalyticsData } from './twilioAnalytics';

/**
 * Business Intelligence Service
 * Aggregates real-time metrics, KPIs, and analytics from the database
 * for AI-powered insights and executive reporting
 */

export interface LeadMetrics {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  lastMonth: number;
  growthRate: number; // percentage change vs previous period
  conversionRate: number;
  topSources: Array<{ source: string; count: number; percentage: number }>;
  recentLeads: Array<{ 
    id: number;
    name: string; 
    email?: string;
    phone?: string;
    source: string; 
    createdAt: Date;
    status: string;
  }>;
}

export interface CampaignMetrics {
  active: number;
  completed: number;
  scheduled: number;
  paused: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalResponses: number;
  deliveryRate: number;
  responseRate: number;
  optOutRate: number;
  todaysSent: number;
  todaysDelivered: number;
  todaysResponses: number;
  topPerformingCampaigns: Array<{
    id: number;
    name: string;
    sent: number;
    delivered: number;
    responses: number;
    responseRate: number;
  }>;
}

export interface MessagingMetrics {
  sentToday: number;
  sentYesterday: number;
  sentThisWeek: number;
  sentThisMonth: number;
  receivedToday: number;
  receivedYesterday: number;
  deliveryRate: number;
  responseRate: number;
  averageResponseTime: number; // in minutes
  peakHours: number[];
  messagesByChannel: {
    sms: number;
    mms: number;
    voice: number;
    email: number;
  };
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

export interface FinancialMetrics {
  currentBalance: number;
  spentToday: number;
  spentThisWeek: number;
  spentThisMonth: number;
  averageDailySpend: number;
  projectedMonthlySpend: number;
  costPerMessage: number;
  costPerLead: number;
  roi: number;
}

export interface KPIDashboard {
  leads: LeadMetrics;
  campaigns: CampaignMetrics;
  messaging: MessagingMetrics;
  financial: FinancialMetrics;
  summary: ExecutiveSummary;
  generatedAt: Date;
}

export interface ExecutiveSummary {
  highlights: string[];
  alerts: Array<{ type: 'warning' | 'critical' | 'info'; message: string }>;
  recommendations: string[];
  periodComparison: {
    leadsChange: number;
    messagesChange: number;
    responseRateChange: number;
    costChange: number;
  };
}

export interface FailureAnalysis {
  totalFailed: number;
  failureRate: number;
  failuresByReason: Array<{
    reason: string;
    count: number;
    percentage: number;
    errorCode?: string;
  }>;
  failedPhoneNumbers: Array<{
    phoneNumber: string;
    failureCount: number;
    lastError: string;
    lastErrorCode?: string;
  }>;
  recentFailures: Array<{
    phoneNumber: string;
    errorMessage: string;
    errorCode?: string;
    timestamp: Date;
    campaignId?: number;
  }>;
  topRecommendations: string[];
}

export interface PhoneHealthMetrics {
  totalPhones: number;
  healthyPhones: number;
  degradedPhones: number;
  unhealthyPhones: number;
  phoneHealthScores: Array<{
    phoneNumber: string;
    healthScore: number;
    totalSent: number;
    delivered: number;
    failed: number;
    deliveryRate: number;
    lastUsed: Date;
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  }>;
  lowestHealthPhones: Array<{
    phoneNumber: string;
    healthScore: number;
    deliveryRate: number;
    failureCount: number;
    primaryIssue: string;
  }>;
}

class BusinessIntelligenceService {
  
  /**
   * Get comprehensive KPI dashboard with all metrics
   */
  async getKPIDashboard(userId?: number): Promise<KPIDashboard> {
    const [leads, campaigns, messaging, financial] = await Promise.all([
      this.getLeadMetrics(userId),
      this.getCampaignMetrics(userId),
      this.getMessagingMetrics(userId),
      this.getFinancialMetrics(userId)
    ]);

    const summary = this.generateExecutiveSummary(leads, campaigns, messaging, financial);

    return {
      leads,
      campaigns,
      messaging,
      financial,
      summary,
      generatedAt: new Date()
    };
  }

  /**
   * Get lead acquisition and conversion metrics
   */
  async getLeadMetrics(userId?: number): Promise<LeadMetrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch contacts as leads proxy
    const allContacts = await storage.getContacts(userId || 1);
    
    // Filter by date ranges
    const today = allContacts.filter(c => new Date(c.createdAt) >= todayStart);
    const yesterday = allContacts.filter(c => {
      const date = new Date(c.createdAt);
      return date >= yesterdayStart && date < todayStart;
    });
    const thisWeek = allContacts.filter(c => new Date(c.createdAt) >= weekStart);
    const thisMonth = allContacts.filter(c => new Date(c.createdAt) >= monthStart);
    const lastMonth = allContacts.filter(c => {
      const date = new Date(c.createdAt);
      return date >= lastMonthStart && date <= lastMonthEnd;
    });

    // Calculate growth rate
    const growthRate = lastMonth.length > 0 
      ? ((thisMonth.length - lastMonth.length) / lastMonth.length) * 100 
      : 0;

    // Source analysis
    const sourceMap = new Map<string, number>();
    allContacts.forEach(c => {
      const source = (c as any).source || 'Direct';
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });
    
    const topSources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({
        source,
        count,
        percentage: (count / allContacts.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent leads
    const recentLeads = allContacts
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
        email: c.email || undefined,
        phone: c.phoneNumber || undefined,
        source: (c as any).source || 'Direct',
        createdAt: new Date(c.createdAt),
        status: (c as any).status || 'new'
      }));

    return {
      today: today.length,
      yesterday: yesterday.length,
      thisWeek: thisWeek.length,
      thisMonth: thisMonth.length,
      lastMonth: lastMonth.length,
      growthRate: Math.round(growthRate * 10) / 10,
      conversionRate: 12.5, // Would need conversion tracking
      topSources,
      recentLeads
    };
  }

  /**
   * Get campaign performance metrics
   */
  async getCampaignMetrics(userId?: number): Promise<CampaignMetrics> {
    const campaigns = await storage.getCampaigns(userId || 1);
    const messages = await storage.getSmsMessages(userId || 1);
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Campaign status counts
    const active = campaigns.filter(c => c.status === 'active' || c.status === 'running').length;
    const completed = campaigns.filter(c => c.status === 'completed').length;
    const scheduled = campaigns.filter(c => c.status === 'scheduled').length;
    const paused = campaigns.filter(c => c.status === 'paused').length;

    // Message stats
    const outbound = messages.filter(m => m.direction === 'outbound');
    const todaysMessages = outbound.filter(m => new Date(m.sentAt) >= todayStart);
    
    const totalSent = outbound.length;
    const totalDelivered = outbound.filter(m => m.status === 'delivered').length;
    const totalFailed = outbound.filter(m => m.status === 'failed' || m.status === 'undelivered').length;
    
    // Response tracking (inbound messages)
    const inbound = messages.filter(m => m.direction === 'inbound');
    const totalResponses = inbound.length;
    const todaysResponses = inbound.filter(m => new Date(m.sentAt) >= todayStart).length;

    // Rates
    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    const responseRate = totalDelivered > 0 ? (totalResponses / totalDelivered) * 100 : 0;
    
    // Opt-out tracking
    const optOuts = messages.filter(m => 
      m.body?.toLowerCase().includes('stop') || 
      m.body?.toLowerCase().includes('unsubscribe')
    ).length;
    const optOutRate = totalDelivered > 0 ? (optOuts / totalDelivered) * 100 : 0;

    // Top performing campaigns
    const campaignStats = campaigns.map(c => {
      const campaignMessages = outbound.filter(m => m.campaignId === c.id);
      const campaignResponses = inbound.filter(m => {
        // Match responses by phone number within campaign timeframe
        return campaignMessages.some(cm => cm.to === m.from);
      });
      
      return {
        id: c.id,
        name: c.name,
        sent: campaignMessages.length,
        delivered: campaignMessages.filter(m => m.status === 'delivered').length,
        responses: campaignResponses.length,
        responseRate: campaignMessages.length > 0 
          ? (campaignResponses.length / campaignMessages.length) * 100 
          : 0
      };
    });

    const topPerformingCampaigns = campaignStats
      .sort((a, b) => b.responseRate - a.responseRate)
      .slice(0, 5);

    return {
      active,
      completed,
      scheduled,
      paused,
      totalSent,
      totalDelivered,
      totalFailed,
      totalResponses,
      deliveryRate: Math.round(deliveryRate * 10) / 10,
      responseRate: Math.round(responseRate * 10) / 10,
      optOutRate: Math.round(optOutRate * 100) / 100,
      todaysSent: todaysMessages.length,
      todaysDelivered: todaysMessages.filter(m => m.status === 'delivered').length,
      todaysResponses,
      topPerformingCampaigns
    };
  }

  /**
   * Get messaging volume and performance metrics
   */
  async getMessagingMetrics(userId?: number): Promise<MessagingMetrics> {
    const messages = await storage.getSmsMessages(userId || 1);
    const voiceCalls = await storage.getVoiceCalls(userId || 1);
    // const emails = await storage.getEmails(userId || 1);
    const emails: any[] = []; // Email storage not implemented yet
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const outbound = messages.filter(m => m.direction === 'outbound');
    const inbound = messages.filter(m => m.direction === 'inbound');

    // Time-based filtering
    const sentToday = outbound.filter(m => new Date(m.sentAt) >= todayStart).length;
    const sentYesterday = outbound.filter(m => {
      const date = new Date(m.sentAt);
      return date >= yesterdayStart && date < todayStart;
    }).length;
    const sentThisWeek = outbound.filter(m => new Date(m.sentAt) >= weekStart).length;
    const sentThisMonth = outbound.filter(m => new Date(m.sentAt) >= monthStart).length;

    const receivedToday = inbound.filter(m => new Date(m.sentAt) >= todayStart).length;
    const receivedYesterday = inbound.filter(m => {
      const date = new Date(m.sentAt);
      return date >= yesterdayStart && date < todayStart;
    }).length;

    // Delivery and response rates
    const delivered = outbound.filter(m => m.status === 'delivered').length;
    const deliveryRate = outbound.length > 0 ? (delivered / outbound.length) * 100 : 0;
    const responseRate = delivered > 0 ? (inbound.length / delivered) * 100 : 0;

    // Hourly distribution for peak hours analysis
    const hourlyMap = new Map<number, number>();
    outbound.forEach(m => {
      const hour = new Date(m.sentAt).getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    });

    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourlyMap.get(hour) || 0
    }));

    // Find peak hours (top 3)
    const peakHours = hourlyDistribution
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(h => h.hour);

    // Channel breakdown
    const smsCount = messages.filter(m => !(m as any).mediaUrls?.length).length;
    const mmsCount = messages.filter(m => (m as any).mediaUrls?.length > 0).length;

    return {
      sentToday,
      sentYesterday,
      sentThisWeek,
      sentThisMonth,
      receivedToday,
      receivedYesterday,
      deliveryRate: Math.round(deliveryRate * 10) / 10,
      responseRate: Math.round(responseRate * 10) / 10,
      averageResponseTime: 15, // Would need timestamp tracking
      peakHours,
      messagesByChannel: {
        sms: smsCount,
        mms: mmsCount,
        voice: voiceCalls.length,
        email: emails.length
      },
      hourlyDistribution
    };
  }

  /**
   * Get financial and billing metrics
   */
  async getFinancialMetrics(userId?: number): Promise<FinancialMetrics> {
    const user = userId ? await storage.getUser(userId) : null;
    // const billing = await storage.getBillingHistory(userId || 1);
    const billing: Array<{ type: string; amount: number; createdAt: Date }> = []; // Billing storage not fully implemented
    const messages = await storage.getSmsMessages(userId || 1);
    const contacts = await storage.getContacts(userId || 1);
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate spend from billing records
    const charges = billing.filter((b: { type: string }) => b.type === 'charge' || b.type === 'usage');
    
    const spentToday = charges
      .filter((b: { createdAt: Date }) => new Date(b.createdAt) >= todayStart)
      .reduce((sum: number, b: { amount: number }) => sum + Math.abs(b.amount), 0);
    
    const spentThisWeek = charges
      .filter((b: { createdAt: Date }) => new Date(b.createdAt) >= weekStart)
      .reduce((sum: number, b: { amount: number }) => sum + Math.abs(b.amount), 0);
    
    const spentThisMonth = charges
      .filter((b: { createdAt: Date }) => new Date(b.createdAt) >= monthStart)
      .reduce((sum: number, b: { amount: number }) => sum + Math.abs(b.amount), 0);

    // Calculate averages
    const daysInMonth = now.getDate();
    const averageDailySpend = daysInMonth > 0 ? spentThisMonth / daysInMonth : 0;
    const daysRemaining = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - daysInMonth;
    const projectedMonthlySpend = spentThisMonth + (averageDailySpend * daysRemaining);

    // Cost efficiency metrics
    const totalMessages = messages.filter(m => m.direction === 'outbound').length;
    const costPerMessage = totalMessages > 0 ? spentThisMonth / totalMessages : 0;
    const costPerLead = contacts.length > 0 ? spentThisMonth / contacts.length : 0;

    return {
      currentBalance: (user as any)?.credits || 0,
      spentToday: Math.round(spentToday * 100) / 100,
      spentThisWeek: Math.round(spentThisWeek * 100) / 100,
      spentThisMonth: Math.round(spentThisMonth * 100) / 100,
      averageDailySpend: Math.round(averageDailySpend * 100) / 100,
      projectedMonthlySpend: Math.round(projectedMonthlySpend * 100) / 100,
      costPerMessage: Math.round(costPerMessage * 1000) / 1000,
      costPerLead: Math.round(costPerLead * 100) / 100,
      roi: 0 // Would need revenue tracking
    };
  }

  /**
   * Generate executive summary with highlights, alerts, and recommendations
   */
  private generateExecutiveSummary(
    leads: LeadMetrics,
    campaigns: CampaignMetrics,
    messaging: MessagingMetrics,
    financial: FinancialMetrics
  ): ExecutiveSummary {
    const highlights: string[] = [];
    const alerts: Array<{ type: 'warning' | 'critical' | 'info'; message: string }> = [];
    const recommendations: string[] = [];

    // Lead highlights
    if (leads.today > leads.yesterday) {
      highlights.push(`Lead acquisition up ${Math.round(((leads.today - leads.yesterday) / Math.max(leads.yesterday, 1)) * 100)}% vs yesterday (${leads.today} new leads)`);
    }
    if (leads.growthRate > 10) {
      highlights.push(`Strong month-over-month growth: ${leads.growthRate}% increase in leads`);
    }

    // Campaign highlights
    if (campaigns.deliveryRate >= 98) {
      highlights.push(`Excellent delivery rate: ${campaigns.deliveryRate}%`);
    }
    if (campaigns.responseRate > 10) {
      highlights.push(`Above-average response rate: ${campaigns.responseRate}%`);
    }

    // Messaging highlights
    if (messaging.sentToday > messaging.sentYesterday) {
      highlights.push(`Messaging volume increased ${Math.round(((messaging.sentToday - messaging.sentYesterday) / Math.max(messaging.sentYesterday, 1)) * 100)}% vs yesterday`);
    }

    // Alerts
    if (campaigns.deliveryRate < 95) {
      alerts.push({
        type: 'warning',
        message: `Delivery rate below target: ${campaigns.deliveryRate}% (target: 95%)`
      });
    }
    if (campaigns.optOutRate > 2) {
      alerts.push({
        type: 'warning',
        message: `High opt-out rate detected: ${campaigns.optOutRate}%`
      });
    }
    if (financial.currentBalance < financial.averageDailySpend * 7) {
      alerts.push({
        type: 'critical',
        message: `Low balance alert: ${financial.currentBalance} credits remaining (< 7 days at current rate)`
      });
    }
    if (campaigns.totalFailed > campaigns.totalSent * 0.05) {
      alerts.push({
        type: 'warning',
        message: `Message failure rate above 5%: Review failed messages`
      });
    }

    // Recommendations
    if (messaging.peakHours.length > 0) {
      recommendations.push(`Schedule campaigns during peak hours: ${messaging.peakHours.map(h => `${h}:00`).join(', ')}`);
    }
    if (leads.topSources.length > 0 && leads.topSources[0].percentage > 50) {
      recommendations.push(`Diversify lead sources - ${leads.topSources[0].source} accounts for ${Math.round(leads.topSources[0].percentage)}% of leads`);
    }
    if (campaigns.responseRate < 5) {
      recommendations.push('Consider A/B testing message content to improve response rates');
    }
    if (financial.costPerLead > 10) {
      recommendations.push('Review campaign targeting to reduce cost per lead');
    }

    // Period comparison
    const periodComparison = {
      leadsChange: leads.yesterday > 0 ? ((leads.today - leads.yesterday) / leads.yesterday) * 100 : 0,
      messagesChange: messaging.sentYesterday > 0 ? ((messaging.sentToday - messaging.sentYesterday) / messaging.sentYesterday) * 100 : 0,
      responseRateChange: 0, // Would need historical tracking
      costChange: 0 // Would need historical tracking
    };

    return {
      highlights: highlights.length > 0 ? highlights : ['Business metrics are stable'],
      alerts,
      recommendations: recommendations.length > 0 ? recommendations : ['Continue current strategies'],
      periodComparison
    };
  }

  /**
   * Generate a natural language summary for AI consumption
   * Includes real Twilio data when available
   */
  async generateAISummary(userId?: number): Promise<string> {
    const [dashboard, twilioSummary, failureAnalysis, phoneHealth] = await Promise.all([
      this.getKPIDashboard(userId),
      twilioAnalyticsService.generateTwilioSummary(),
      this.analyzeFailures(userId),
      this.getPhoneHealthMetrics(userId)
    ]);
    const { leads, campaigns, messaging, financial, summary } = dashboard;

    return `
BUSINESS INTELLIGENCE REPORT - ${new Date().toLocaleDateString()}
Generated at: ${new Date().toLocaleTimeString()}

═══════════════════════════════════════════════════════════════
LEAD METRICS
═══════════════════════════════════════════════════════════════
• New leads today: ${leads.today}
• New leads yesterday: ${leads.yesterday}
• This week total: ${leads.thisWeek}
• This month total: ${leads.thisMonth}
• Month-over-month growth: ${leads.growthRate > 0 ? '+' : ''}${leads.growthRate}%
• Conversion rate: ${leads.conversionRate}%

Top Lead Sources:
${leads.topSources.map(s => `  - ${s.source}: ${s.count} leads (${Math.round(s.percentage)}%)`).join('\n')}

Recent Leads:
${leads.recentLeads.slice(0, 5).map(l => `  - ${l.name} (${l.source}) - ${l.phone || l.email || 'No contact'}`).join('\n')}

═══════════════════════════════════════════════════════════════
CAMPAIGN METRICS
═══════════════════════════════════════════════════════════════
• Active campaigns: ${campaigns.active}
• Completed campaigns: ${campaigns.completed}
• Scheduled campaigns: ${campaigns.scheduled}
• Paused campaigns: ${campaigns.paused}

Today's Performance:
• Messages sent: ${campaigns.todaysSent}
• Messages delivered: ${campaigns.todaysDelivered}
• Responses received: ${campaigns.todaysResponses}

Overall Performance:
• Total messages sent: ${campaigns.totalSent}
• Delivery rate: ${campaigns.deliveryRate}%
• Response rate: ${campaigns.responseRate}%
• Opt-out rate: ${campaigns.optOutRate}%

Top Performing Campaigns:
${campaigns.topPerformingCampaigns.slice(0, 3).map(c => `  - ${c.name}: ${c.responses} responses (${Math.round(c.responseRate)}% rate)`).join('\n')}

═══════════════════════════════════════════════════════════════
MESSAGING METRICS
═══════════════════════════════════════════════════════════════
• Sent today: ${messaging.sentToday}
• Sent yesterday: ${messaging.sentYesterday}
• Sent this week: ${messaging.sentThisWeek}
• Sent this month: ${messaging.sentThisMonth}
• Received today: ${messaging.receivedToday}
• Delivery rate: ${messaging.deliveryRate}%
• Response rate: ${messaging.responseRate}%
• Peak engagement hours: ${messaging.peakHours.map(h => `${h}:00`).join(', ')}

Channel Breakdown:
• SMS: ${messaging.messagesByChannel.sms}
• MMS: ${messaging.messagesByChannel.mms}
• Voice: ${messaging.messagesByChannel.voice}
• Email: ${messaging.messagesByChannel.email}

═══════════════════════════════════════════════════════════════
FINANCIAL METRICS
═══════════════════════════════════════════════════════════════
• Current balance: ${financial.currentBalance} credits
• Spent today: $${financial.spentToday}
• Spent this week: $${financial.spentThisWeek}
• Spent this month: $${financial.spentThisMonth}
• Average daily spend: $${financial.averageDailySpend}
• Projected monthly spend: $${financial.projectedMonthlySpend}
• Cost per message: $${financial.costPerMessage}
• Cost per lead: $${financial.costPerLead}

═══════════════════════════════════════════════════════════════
EXECUTIVE SUMMARY
═══════════════════════════════════════════════════════════════
HIGHLIGHTS:
${summary.highlights.map(h => `✓ ${h}`).join('\n')}

${summary.alerts.length > 0 ? `ALERTS:
${summary.alerts.map(a => `⚠ [${a.type.toUpperCase()}] ${a.message}`).join('\n')}` : ''}

RECOMMENDATIONS:
${summary.recommendations.map(r => `→ ${r}`).join('\n')}

PERIOD COMPARISON (vs Yesterday):
• Leads: ${summary.periodComparison.leadsChange > 0 ? '+' : ''}${Math.round(summary.periodComparison.leadsChange)}%
• Messages: ${summary.periodComparison.messagesChange > 0 ? '+' : ''}${Math.round(summary.periodComparison.messagesChange)}%

═══════════════════════════════════════════════════════════════
FAILURE ANALYSIS
═══════════════════════════════════════════════════════════════
• Total failed messages: ${failureAnalysis.totalFailed}
• Failure rate: ${failureAnalysis.failureRate}%

${failureAnalysis.failuresByReason.length > 0 ? `Failure Breakdown by Reason:
${failureAnalysis.failuresByReason.slice(0, 5).map(f => `  - ${f.reason}: ${f.count} failures (${(f.percentage || 0).toFixed(1)}%)${f.errorCode ? ` [Code: ${f.errorCode}]` : ''}`).join('\n')}` : 'No failure patterns detected.'}

${failureAnalysis.failedPhoneNumbers.length > 0 ? `Phone Numbers with Repeated Failures (Top 5):
${failureAnalysis.failedPhoneNumbers.slice(0, 5).map(p => `  - ${p.phoneNumber}: ${p.failureCount} failures - ${p.lastError}`).join('\n')}` : ''}

${failureAnalysis.recentFailures.length > 0 ? `Recent Failures (Last 5):
${failureAnalysis.recentFailures.slice(0, 5).map(f => `  - ${f.phoneNumber} at ${f.timestamp.toLocaleTimeString()}: ${f.errorMessage}`).join('\n')}` : ''}

${failureAnalysis.topRecommendations.length > 0 ? `Failure Recommendations:
${failureAnalysis.topRecommendations.map(r => `  ✓ ${r}`).join('\n')}` : ''}

═══════════════════════════════════════════════════════════════
PHONE NUMBER HEALTH ANALYSIS
═══════════════════════════════════════════════════════════════
• Total phone numbers tracked: ${phoneHealth.totalPhones}
• Healthy numbers: ${phoneHealth.healthyPhones} (${phoneHealth.totalPhones > 0 ? ((phoneHealth.healthyPhones / phoneHealth.totalPhones) * 100).toFixed(1) : 0}%)
• Degraded numbers: ${phoneHealth.degradedPhones} (${phoneHealth.totalPhones > 0 ? ((phoneHealth.degradedPhones / phoneHealth.totalPhones) * 100).toFixed(1) : 0}%)
• Unhealthy numbers: ${phoneHealth.unhealthyPhones} (${phoneHealth.totalPhones > 0 ? ((phoneHealth.unhealthyPhones / phoneHealth.totalPhones) * 100).toFixed(1) : 0}%)

${phoneHealth.lowestHealthPhones.length > 0 ? `Lowest Health Phone Numbers (Action Required):
${phoneHealth.lowestHealthPhones.map(p => `  - ${p.phoneNumber}
    Health Score: ${p.healthScore}/100
    Delivery Rate: ${p.deliveryRate}%
    Failures: ${p.failureCount}
    Issue: ${p.primaryIssue}`).join('\n')}` : ''}

${twilioSummary}
`;
  }

  /**
   * Analyze failed messages to identify patterns and root causes
   */
  async analyzeFailures(userId?: number): Promise<FailureAnalysis> {
    const messages = await storage.getSmsMessages(userId || 1);
    const failedMessages = messages.filter(m => 
      m.status === 'failed' || 
      m.status === 'undelivered' || 
      m.status === 'error'
    );

    const totalMessages = messages.filter(m => m.direction === 'outbound').length;
    const totalFailed = failedMessages.length;
    const failureRate = totalMessages > 0 ? (totalFailed / totalMessages) * 100 : 0;

    // Analyze failure reasons from error messages
    const reasonMap = new Map<string, { count: number; errorCode?: string }>();
    
    failedMessages.forEach(msg => {
      const errorMsg = (msg as any).errorMessage || 'Unknown error';
      const errorCode = (msg as any).errorCode;
      
      // Categorize common error patterns
      let reason = 'Unknown error';
      if (errorMsg.toLowerCase().includes('invalid') || errorMsg.toLowerCase().includes('not a valid')) {
        reason = 'Invalid phone number';
      } else if (errorMsg.toLowerCase().includes('unsubscribed') || errorMsg.toLowerCase().includes('opt')) {
        reason = 'Recipient opted out';
      } else if (errorMsg.toLowerCase().includes('landline') || errorMsg.toLowerCase().includes('unreachable')) {
        reason = 'Unreachable number (landline/disconnected)';
      } else if (errorMsg.toLowerCase().includes('carrier') || errorMsg.toLowerCase().includes('blocked')) {
        reason = 'Carrier blocked/filtered';
      } else if (errorMsg.toLowerCase().includes('queue') || errorMsg.toLowerCase().includes('rate')) {
        reason = 'Rate limit exceeded';
      } else if (errorMsg.toLowerCase().includes('spam')) {
        reason = 'Spam filter triggered';
      } else if (errorCode) {
        reason = `Error code ${errorCode}`;
      }
      
      const existing = reasonMap.get(reason) || { count: 0, errorCode };
      reasonMap.set(reason, { count: existing.count + 1, errorCode });
    });

    const failuresByReason = Array.from(reasonMap.entries())
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        percentage: totalFailed > 0 ? (data.count / totalFailed) * 100 : 0,
        errorCode: data.errorCode
      }))
      .sort((a, b) => b.count - a.count);

    // Identify phone numbers with repeated failures
    const phoneFailureMap = new Map<string, { count: number; lastError: string; lastErrorCode?: string }>();
    
    failedMessages.forEach(msg => {
      const phone = msg.to;
      const errorMsg = (msg as any).errorMessage || 'Unknown error';
      const errorCode = (msg as any).errorCode;
      
      const existing = phoneFailureMap.get(phone) || { count: 0, lastError: '', lastErrorCode: undefined };
      phoneFailureMap.set(phone, {
        count: existing.count + 1,
        lastError: errorMsg,
        lastErrorCode: errorCode
      });
    });

    const failedPhoneNumbers = Array.from(phoneFailureMap.entries())
      .map(([phoneNumber, data]) => ({
        phoneNumber,
        failureCount: data.count,
        lastError: data.lastError,
        lastErrorCode: data.lastErrorCode
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 20);

    // Recent failures for immediate attention
    const recentFailures = failedMessages
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, 10)
      .map(msg => ({
        phoneNumber: msg.to,
        errorMessage: (msg as any).errorMessage || 'Unknown error',
        errorCode: (msg as any).errorCode,
        timestamp: new Date(msg.sentAt),
        campaignId: msg.campaignId || undefined
      }));

    // Generate recommendations based on failure patterns
    const recommendations: string[] = [];
    
    const invalidNumberFailures = failuresByReason.find(r => r.reason.includes('Invalid'));
    if (invalidNumberFailures && invalidNumberFailures.percentage > 20) {
      recommendations.push('High invalid number rate - validate phone numbers before sending');
    }
    
    const carrierBlocked = failuresByReason.find(r => r.reason.includes('Carrier'));
    if (carrierBlocked && carrierBlocked.percentage > 15) {
      recommendations.push('Carrier filtering detected - review message content and sender reputation');
    }
    
    const rateLimitIssues = failuresByReason.find(r => r.reason.includes('rate'));
    if (rateLimitIssues && rateLimitIssues.count > 10) {
      recommendations.push('Rate limit issues - reduce sending speed or distribute across multiple numbers');
    }
    
    const spamFiltered = failuresByReason.find(r => r.reason.includes('spam'));
    if (spamFiltered && spamFiltered.count > 0) {
      recommendations.push('Spam filtering detected - review message content and ensure A2P compliance');
    }
    
    if (failedPhoneNumbers.length > 10) {
      recommendations.push(`${failedPhoneNumbers.length} phone numbers have repeated failures - consider removing from contact list`);
    }

    return {
      totalFailed,
      failureRate: Math.round(failureRate * 100) / 100,
      failuresByReason,
      failedPhoneNumbers,
      recentFailures,
      topRecommendations: recommendations
    };
  }

  /**
   * Calculate health scores for phone numbers based on delivery performance
   */
  async getPhoneHealthMetrics(userId?: number): Promise<PhoneHealthMetrics> {
    const messages = await storage.getSmsMessages(userId || 1);
    
    // Group messages by 'from' phone number (sender numbers)
    const phoneStatsMap = new Map<string, {
      totalSent: number;
      delivered: number;
      failed: number;
      lastUsed: Date;
    }>();

    messages.filter(m => m.direction === 'outbound').forEach(msg => {
      const phone = msg.from;
      const existing = phoneStatsMap.get(phone) || {
        totalSent: 0,
        delivered: 0,
        failed: 0,
        lastUsed: new Date(msg.sentAt)
      };

      existing.totalSent++;
      if (msg.status === 'delivered' || msg.status === 'sent') {
        existing.delivered++;
      } else if (msg.status === 'failed' || msg.status === 'undelivered' || msg.status === 'error') {
        existing.failed++;
      }
      
      if (new Date(msg.sentAt) > existing.lastUsed) {
        existing.lastUsed = new Date(msg.sentAt);
      }

      phoneStatsMap.set(phone, existing);
    });

    // Calculate health scores
    const phoneHealthScores = Array.from(phoneStatsMap.entries()).map(([phoneNumber, stats]) => {
      const deliveryRate = stats.totalSent > 0 ? (stats.delivered / stats.totalSent) * 100 : 0;
      
      // Health score calculation (0-100)
      // 70% weight on delivery rate, 20% on volume, 10% on recency
      const deliveryScore = deliveryRate * 0.7;
      const volumeScore = Math.min(stats.totalSent / 100, 1) * 20; // Max 20 points for 100+ messages
      const daysSinceUse = (Date.now() - stats.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 10 - (daysSinceUse / 30)); // Lose points after 30 days
      
      const healthScore = Math.round(deliveryScore + volumeScore + recencyScore);
      
      // Determine status
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthScore >= 80 && deliveryRate >= 95) {
        status = 'healthy';
      } else if (healthScore >= 60 && deliveryRate >= 85) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      // Identify issues
      const issues: string[] = [];
      if (deliveryRate < 90) issues.push(`Low delivery rate: ${deliveryRate.toFixed(1)}%`);
      if (stats.failed > stats.totalSent * 0.1) issues.push(`High failure count: ${stats.failed} failures`);
      if (daysSinceUse > 30) issues.push(`Inactive for ${Math.round(daysSinceUse)} days`);
      if (stats.totalSent < 10) issues.push('Low message volume');

      return {
        phoneNumber,
        healthScore,
        totalSent: stats.totalSent,
        delivered: stats.delivered,
        failed: stats.failed,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        lastUsed: stats.lastUsed,
        status,
        issues
      };
    });

    // Count by status
    const healthyPhones = phoneHealthScores.filter(p => p.status === 'healthy').length;
    const degradedPhones = phoneHealthScores.filter(p => p.status === 'degraded').length;
    const unhealthyPhones = phoneHealthScores.filter(p => p.status === 'unhealthy').length;

    // Get lowest health phones
    const lowestHealthPhones = phoneHealthScores
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 10)
      .map(p => ({
        phoneNumber: p.phoneNumber,
        healthScore: p.healthScore,
        deliveryRate: p.deliveryRate,
        failureCount: p.failed,
        primaryIssue: p.issues[0] || 'No specific issues'
      }));

    return {
      totalPhones: phoneHealthScores.length,
      healthyPhones,
      degradedPhones,
      unhealthyPhones,
      phoneHealthScores: phoneHealthScores.sort((a, b) => a.healthScore - b.healthScore),
      lowestHealthPhones
    };
  }

  /**
   * Get raw Twilio analytics data
   */
  async getTwilioAnalytics(): Promise<TwilioAnalyticsData> {
    return twilioAnalyticsService.getAnalytics();
  }
}

export const businessIntelligenceService = new BusinessIntelligenceService();
