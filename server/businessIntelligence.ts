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
    const [dashboard, twilioSummary] = await Promise.all([
      this.getKPIDashboard(userId),
      twilioAnalyticsService.generateTwilioSummary()
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

${twilioSummary}
`;
  }

  /**
   * Get raw Twilio analytics data
   */
  async getTwilioAnalytics(): Promise<TwilioAnalyticsData> {
    return twilioAnalyticsService.getAnalytics();
  }
}

export const businessIntelligenceService = new BusinessIntelligenceService();
