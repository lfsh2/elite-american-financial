import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  MessageSquare, 
  Phone, 
  DollarSign,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Shield,
  Zap,
  Users,
  Bell,
  ExternalLink,
  ChevronRight,
  Info,
  Lightbulb,
  X,
  ThumbsUp,
  ThumbsDown,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  AreaChart, 
  Area, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { useAccountAnalytics, formatNumber } from '../hooks/useTwilioData';
import { useAccount } from '@/contexts/AccountContext';
import { PhoneHealthDashboard } from '@/components/PhoneHealthDashboard';
import { usePhoneHealth } from '@/hooks/usePhoneHealth';

type TimePeriod = 'day' | 'week' | 'month';
type AnalyticsTab = 'overview' | 'delivery' | 'response' | 'latency' | 'engagement' | 'health';

// Health score rating helper
const getHealthRating = (score: number) => {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-600', bgColor: 'bg-green-500' };
  if (score >= 60) return { label: 'Good', color: 'text-blue-600', bgColor: 'bg-blue-500' };
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-600', bgColor: 'bg-yellow-500' };
  return { label: 'Poor', color: 'text-red-600', bgColor: 'bg-red-500' };
};

// Metric rating helper
const getMetricRating = (value: number, thresholds: { excellent: number; good: number; fair: number }) => {
  if (value >= thresholds.excellent) return { label: 'Excellent', color: 'bg-green-100 text-green-700 border-green-200' };
  if (value >= thresholds.good) return { label: 'Good', color: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (value >= thresholds.fair) return { label: 'Fair', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label: 'Bad', color: 'bg-red-100 text-red-700 border-red-200' };
};

export default function Analytics() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('week');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [showRecommendation, setShowRecommendation] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const { data: accountData, loading, currentAccount } = useAccountAnalytics();
  const { accounts } = useAccount();
  
  // Map dateFilter to healthDateRange format
  const healthDateRange: 'today' | '7days' | '30days' | '90days' = 
    dateFilter === 'today' ? 'today' :
    dateFilter === 'week' ? '7days' :
    dateFilter === 'month' ? '30days' : '90days';
  
  const { data: phoneHealthData, loading: healthLoading, refresh: refreshHealth } = usePhoneHealth(healthDateRange);

  // Transform account data to analytics format for compatibility
  const analytics = useMemo(() => {
    if (!accountData || accountData.accounts.length === 0) return null;
    
    // Filter by selected provider if not "all"
    const filteredAccounts = selectedProvider === 'all' 
      ? accountData.accounts 
      : accountData.accounts.filter(a => a.accountId === selectedProvider);
    
    if (filteredAccounts.length === 0 && accountData.accounts.length > 0) {
      // Use all accounts if filter returns nothing
      return accountData.accounts[0]?.analytics || null;
    }
    
    // If single account selected, use its analytics directly
    if (filteredAccounts.length === 1) {
      return filteredAccounts[0].analytics;
    }
    
    // For multiple accounts, merge the data
    const mergedMessages = {
      today: accountData.messages.today,
      thisWeek: accountData.messages.thisWeek,
      thisMonth: accountData.messages.thisMonth,
    };
    
    const mergedCalls = {
      today: accountData.calls.today,
      thisWeek: accountData.calls.thisWeek,
      thisMonth: accountData.calls.thisMonth,
    };
    
    // Return merged analytics structure
    return {
      account: {
        sid: 'merged',
        friendlyName: 'All Accounts',
        status: 'active',
        type: 'merged',
        dateCreated: new Date().toISOString(),
      },
      phoneNumbers: filteredAccounts.flatMap(a => a.analytics.phoneNumbers || []),
      messages: mergedMessages,
      calls: mergedCalls,
      metrics: {
        totalMessagesSentToday: accountData.aggregatedMetrics.totalMessagesSentToday,
        totalMessagesReceivedToday: accountData.aggregatedMetrics.totalMessagesReceivedToday,
        totalMessagesSentYesterday: 0,
        totalMessagesReceivedYesterday: 0,
        totalMessagesSentThisWeek: accountData.aggregatedMetrics.totalMessagesSentThisWeek,
        totalMessagesSentThisMonth: accountData.aggregatedMetrics.totalMessagesSentThisMonth,
        deliveredToday: 0,
        failedToday: 0,
        deliveryRateToday: accountData.aggregatedMetrics.deliveryRate,
        totalCallsToday: accountData.aggregatedMetrics.totalCallsToday,
        totalCallsThisWeek: accountData.aggregatedMetrics.totalCallsThisWeek,
        totalCallDurationToday: accountData.aggregatedMetrics.totalCallDurationToday,
        totalSpendToday: accountData.aggregatedMetrics.totalSpendToday,
        totalSpendThisMonth: accountData.aggregatedMetrics.totalSpendThisMonth,
        averageMessageCost: 0.0075,
      },
    };
  }, [accountData, selectedProvider]);

  // Get current provider name for display
  const currentProviderName = useMemo(() => {
    if (selectedProvider === 'all') return 'All Providers';
    const account = accounts?.find(a => a.id === selectedProvider);
    if (account?.provider === 'commio') return 'Commio';
    if (account?.provider === 'twilio') return 'Twilio';
    return account?.name || 'Provider';
  }, [selectedProvider, accounts]);

  // Chart data from DB dailyChartData (source of truth — includes campaigns + sms_messages)
  const chartData = useMemo(() => {
    const daily = accountData?.dailyChartData || [];
    const now = new Date();
    
    // Determine days based on dateFilter (overrides timePeriod for chart)
    let days = 7; // default
    if (dateFilter === 'today') days = 1;
    else if (dateFilter === 'week') days = 7;
    else if (dateFilter === 'month') days = 30;
    else if (dateFilter === 'all') days = Math.min(90, daily.length); // Show up to 90 days for 'all'
    
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - 1 - i));
      const dateStr = date.toISOString().split('T')[0];
      const dayData = daily.find((d: any) => String(d.date).startsWith(dateStr));
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        messages: dayData ? (dayData.outbound || 0) + (dayData.inbound || 0) : 0,
        calls: 0,
        failed: dayData ? (dayData.failed || 0) : 0,
      };
    });
  }, [accountData, dateFilter]);

  // Message status breakdown from DB aggregated metrics (source of truth)
  const messageStatusData = useMemo(() => {
    if (!accountData) return [];
    const agg = accountData.aggregatedMetrics;
    
    // Use appropriate total based on dateFilter
    let total = 0;
    if (dateFilter === 'today') total = agg.totalMessagesSentToday || 0;
    else if (dateFilter === 'week') total = agg.totalMessagesSentThisWeek || 0;
    else if (dateFilter === 'month') total = agg.totalMessagesSentThisMonth || 0;
    else total = agg.totalMessagesSentThisMonth || 0; // 'all' uses month as proxy
    
    const deliveryRate = agg.deliveryRate || 0;
    const failureRate = (agg as any).failureRate || 0;
    
    const delivered = Math.round(total * (deliveryRate / 100));
    const failed = Math.round(total * (failureRate / 100));
    const pending = Math.max(0, total - delivered - failed);
    
    return [
      { name: 'Delivered', value: delivered, color: '#10b981' },
      { name: 'Failed', value: failed, color: '#ef4444' },
      { name: 'Pending', value: pending, color: '#f59e0b' }
    ];
  }, [accountData, dateFilter]);

  // Calculate health metrics from DB aggregated metrics (source of truth)
  const healthMetrics = useMemo(() => {
    if (!accountData) return null;
    const agg = accountData.aggregatedMetrics;
    
    // Use appropriate total based on dateFilter
    let totalMessages = 0;
    let sentRateChange = 0;
    
    if (dateFilter === 'today') {
      totalMessages = agg.totalMessagesSentToday || 0;
      const yesterday = (agg as any).totalMessagesSentYesterday || 0;
      sentRateChange = yesterday > 0 ? Math.round(((totalMessages - yesterday) / yesterday) * 10) : 0;
    } else if (dateFilter === 'week') {
      totalMessages = agg.totalMessagesSentThisWeek || 0;
      const lastWeek = (agg as any).totalMessagesSentLastWeek || 0;
      sentRateChange = lastWeek > 0 ? Math.round(((totalMessages - lastWeek) / lastWeek) * 10) : 0;
    } else if (dateFilter === 'month') {
      totalMessages = agg.totalMessagesSentThisMonth || 0;
      const lastMonth = (agg as any).totalMessagesSentLastMonth || 0;
      sentRateChange = lastMonth > 0 ? Math.round(((totalMessages - lastMonth) / lastMonth) * 10) : 0;
    } else { // 'all'
      totalMessages = agg.totalMessagesSentThisMonth || 0;
      sentRateChange = 0;
    }
    
    const deliveryRate = agg.deliveryRate || 0;
    const failureRate = (agg as any).failureRate || 0;
    
    const delivered = Math.round(totalMessages * (deliveryRate / 100));
    const failed = Math.round(totalMessages * (failureRate / 100));
    
    // Sent Rate: Messages that were successfully sent (not failed)
    const sentRate = totalMessages > 0 ? Math.round(((totalMessages - failed) / totalMessages) * 100) : 100;
    
    // Compliance Rate: estimate from delivery rate (higher delivery = better compliance)
    const complianceRate = Math.min(100, Math.round(deliveryRate + 5));
    
    // Fraud Score: inverse of failure rate (low failures = low fraud risk)
    const fraudScore = Math.min(100, Math.round(100 - failureRate));
    
    // Latency Score: based on delivery success (delivered messages processed quickly)
    const latencyScore = Math.min(100, Math.round(deliveryRate + 3));
    
    // Engagement Rate: inbound / outbound
    const inboundToday = agg.totalMessagesReceivedToday || 0;
    const outboundToday = agg.totalMessagesSentToday || 0;
    const engagementRate = outboundToday > 0 
      ? Math.min(100, Math.round((inboundToday / outboundToday) * 100))
      : 0;
    
    // Overall health score (weighted average)
    const healthScore = Math.round(
      (sentRate * 0.3) + 
      (complianceRate * 0.2) + 
      (fraudScore * 0.2) + 
      (latencyScore * 0.15) + 
      (engagementRate * 0.15)
    );
    
    const complianceChange = 0;
    
    return {
      healthScore,
      sentRate,
      complianceRate,
      fraudScore,
      latencyScore,
      engagementRate,
      totalMessages,
      delivered,
      failed,
      sentRateChange,
      complianceChange,
    };
  }, [accountData, dateFilter]);

  // Calculate error data from actual API data
  const errorData = useMemo(() => {
    if (!analytics) return [];
    
    // Error code descriptions
    const errorDescriptions: Record<string, string> = {
      '30001': 'Queue overflow',
      '30002': 'Account suspended',
      '30003': 'Unreachable destination handset',
      '30004': 'Message blocked',
      '30005': 'Unknown destination handset',
      '30006': 'Landline or unreachable carrier',
      '30007': 'Carrier violation',
      '30008': 'Unknown error',
      '21610': 'Message blocked - STOP received',
      '21611': 'Invalid To phone number',
      '21612': 'Invalid From phone number',
    };
    
    // Group messages by error code
    const errorCounts: Record<string, number> = {};
    analytics.messages.thisMonth
      .filter(m => m.errorCode)
      .forEach(m => {
        const code = String(m.errorCode);
        errorCounts[code] = (errorCounts[code] || 0) + 1;
      });
    
    // Convert to array and sort by count
    return Object.entries(errorCounts)
      .map(([code, count]) => ({
        code,
        description: errorDescriptions[code] || 'Unknown error',
        count,
        severity: count > 100 ? 'high' : count > 20 ? 'medium' : 'low'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 errors
  }, [analytics]);

  // Stats from DB aggregated metrics (source of truth — same pattern as Dashboard)
  const stats = useMemo(() => {
    if (!accountData) return null;
    const agg = accountData.aggregatedMetrics;
    
    // Use appropriate totals based on dateFilter
    let totalMessages = 0;
    let messageGrowth = 0;
    let inbound = 0;
    let outbound = 0;
    
    if (dateFilter === 'today') {
      totalMessages = agg.totalMessagesSentToday || 0;
      const yesterday = (agg as any).totalMessagesSentYesterday || 0;
      messageGrowth = yesterday > 0 ? parseFloat(((totalMessages - yesterday) / yesterday * 100).toFixed(1)) : totalMessages > 0 ? 100 : 0;
      inbound = agg.totalMessagesReceivedToday || 0;
      outbound = agg.totalMessagesSentToday || 0;
    } else if (dateFilter === 'week') {
      totalMessages = agg.totalMessagesSentThisWeek || 0;
      const lastWeek = (agg as any).totalMessagesSentLastWeek || 0;
      messageGrowth = lastWeek > 0 ? parseFloat(((totalMessages - lastWeek) / lastWeek * 100).toFixed(1)) : totalMessages > 0 ? 100 : 0;
      inbound = agg.totalMessagesReceivedToday || 0; // Use today for inbound
      outbound = agg.totalMessagesSentToday || 0;
    } else if (dateFilter === 'month') {
      totalMessages = agg.totalMessagesSentThisMonth || 0;
      const lastMonth = (agg as any).totalMessagesSentLastMonth || 0;
      messageGrowth = lastMonth > 0 ? parseFloat(((totalMessages - lastMonth) / lastMonth * 100).toFixed(1)) : totalMessages > 0 ? 100 : 0;
      inbound = agg.totalMessagesReceivedToday || 0;
      outbound = agg.totalMessagesSentToday || 0;
    } else { // 'all'
      totalMessages = agg.totalMessagesSentThisMonth || 0; // Use month as proxy for 'all'
      messageGrowth = 0;
      inbound = agg.totalMessagesReceivedToday || 0;
      outbound = agg.totalMessagesSentToday || 0;
    }
    
    const totalCalls = agg.totalCallsThisWeek || 0;
    const deliveryRate = agg.deliveryRate || 0;
    const avgCost = totalMessages > 0 ? 0.0075 : 0;
    const callGrowth = 0; // No historical call data yet
    const costChange = 0;
    
    return {
      totalMessages, totalCalls, deliveryRate, avgCost: avgCost.toFixed(4),
      messageGrowth, callGrowth, costChange,
      inbound, outbound
    };
  }, [accountData, dateFilter]);

  if (loading || !stats || !healthMetrics) {
    return (
      <div className="flex-1 p-8 pt-6 bg-gray-50/50">
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  const totalStatus = messageStatusData.reduce((sum, item) => sum + item.value, 0);
  const healthRating = getHealthRating(healthMetrics.healthScore);

  // Date range for display
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 7);
  const dateRangeText = `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="flex-1 space-y-6 p-6 bg-gray-50/50">
      {/* Navigation Tabs */}
      <div className="border-b bg-white -mx-6 -mt-6 px-6 pt-4">
        <div className="flex items-center justify-between mb-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalyticsTab)}>
            <TabsList className="bg-transparent border-0 h-auto p-0 gap-0">
              <TabsTrigger 
                value="overview" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="delivery" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                Delivery & Errors
              </TabsTrigger>
              <TabsTrigger 
                value="response" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                Response
              </TabsTrigger>
              <TabsTrigger 
                value="latency" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                Latency
              </TabsTrigger>
              <TabsTrigger 
                value="engagement" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                Engagement
              </TabsTrigger>
              <TabsTrigger 
                value="health" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3"
              >
                <Activity className="w-4 h-4 mr-2" />
                Phone Health
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Select Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {accounts?.filter(a => a.type === 'master').map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex items-center gap-2">
                      <span>{account.friendlyName || account.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {account.provider === 'commio' ? 'Commio' : account.provider === 'twilio' ? 'Twilio' : account.provider}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Health Score Section - Horizontal Layout like Twilio */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-6 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Health Score Gauge - Takes 1 column */}
            <div className="p-6 lg:col-span-1 flex flex-col">
              <div className="mb-2">
                <p className="text-sm text-muted-foreground">Your Messaging Health Score is</p>
                <span className={`text-lg font-bold ${healthRating.color}`}>{healthRating.label}</span>
              </div>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-7 w-fit mb-3">
                <Bell className="h-3 w-3" />
                Set up notifications
              </Button>
              <p className="text-xs text-muted-foreground mb-4">
                Reporting window: {dateRangeText}
              </p>
              
              {/* Circular Health Score */}
              <div className="flex items-center justify-center mb-3 flex-1">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="56" stroke="#e5e7eb" strokeWidth="10" fill="none" />
                    <circle
                      cx="64" cy="64" r="56"
                      stroke={healthMetrics.healthScore >= 80 ? '#10b981' : healthMetrics.healthScore >= 60 ? '#3b82f6' : healthMetrics.healthScore >= 40 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="10" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.healthScore / 100) * 352} 352`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold">{healthMetrics.healthScore}</span>
                    <span className={`text-xs font-medium ${healthRating.color}`}>{healthRating.label}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>100</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs">
                {healthMetrics.sentRateChange < 0 ? (
                  <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 gap-1 text-xs h-5">
                    <ArrowDownRight className="h-3 w-3" />
                    {Math.abs(healthMetrics.sentRateChange)} points
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1 text-xs h-5">
                    <ArrowUpRight className="h-3 w-3" />
                    +{healthMetrics.sentRateChange} points
                  </Badge>
                )}
                <span className="text-muted-foreground">from prior period</span>
              </div>
              <Button variant="link" className="p-0 h-auto mt-2 text-primary text-xs justify-start">
                Learn more <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>

            {/* Sent Rate */}
            <div className="p-4 lg:col-span-1 flex flex-col items-center justify-center hover:bg-gray-50/50 transition-colors cursor-pointer group">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                Sent rate
                <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <div className="flex items-center justify-center mb-2">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={healthMetrics.sentRate >= 85 ? '#10b981' : healthMetrics.sentRate >= 70 ? '#3b82f6' : '#f59e0b'}
                      strokeWidth="5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.sentRate / 100) * 163} 163`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{healthMetrics.sentRate}%</span>
                </div>
              </div>
              <Badge className={`${getMetricRating(healthMetrics.sentRate, { excellent: 95, good: 85, fair: 70 }).color} border`}>
                {getMetricRating(healthMetrics.sentRate, { excellent: 95, good: 85, fair: 70 }).label}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                {healthMetrics.sentRateChange < 0 ? (
                  <>
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    <span className="text-red-600">{Math.abs(healthMetrics.sentRateChange)} from prior period</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    <span className="text-green-600">+{healthMetrics.sentRateChange} from prior period</span>
                  </>
                )}
              </div>
            </div>

            {/* Compliance */}
            <div className="p-4 lg:col-span-1 flex flex-col items-center justify-center hover:bg-gray-50/50 transition-colors cursor-pointer group">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                Compliance
                <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <div className="flex items-center justify-center mb-2">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={healthMetrics.complianceRate >= 85 ? '#10b981' : healthMetrics.complianceRate >= 70 ? '#3b82f6' : '#f59e0b'}
                      strokeWidth="5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.complianceRate / 100) * 163} 163`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{healthMetrics.complianceRate}%</span>
                </div>
              </div>
              <Badge className={`${getMetricRating(healthMetrics.complianceRate, { excellent: 95, good: 85, fair: 70 }).color} border`}>
                {getMetricRating(healthMetrics.complianceRate, { excellent: 95, good: 85, fair: 70 }).label}
              </Badge>
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-green-500" />
                <span className="text-green-600">+{healthMetrics.complianceChange} from prior period</span>
              </div>
            </div>

            {/* Fraud */}
            <div className="p-4 lg:col-span-1 flex flex-col items-center justify-center hover:bg-gray-50/50 transition-colors cursor-pointer group">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                Fraud
                <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <div className="flex items-center justify-center mb-2">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={healthMetrics.fraudScore >= 85 ? '#10b981' : healthMetrics.fraudScore >= 70 ? '#3b82f6' : '#f59e0b'}
                      strokeWidth="5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.fraudScore / 100) * 163} 163`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{healthMetrics.fraudScore}%</span>
                </div>
              </div>
              <Badge className={`${getMetricRating(healthMetrics.fraudScore, { excellent: 95, good: 85, fair: 70 }).color} border`}>
                {getMetricRating(healthMetrics.fraudScore, { excellent: 95, good: 85, fair: 70 }).label}
              </Badge>
              <div className="mt-1 text-xs text-muted-foreground text-center">
                No change
              </div>
            </div>

            {/* Latency */}
            <div className="p-4 lg:col-span-1 flex flex-col items-center justify-center hover:bg-gray-50/50 transition-colors cursor-pointer group">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                Latency
                <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <div className="flex items-center justify-center mb-2">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={healthMetrics.latencyScore >= 85 ? '#10b981' : healthMetrics.latencyScore >= 70 ? '#3b82f6' : '#f59e0b'}
                      strokeWidth="5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.latencyScore / 100) * 163} 163`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{healthMetrics.latencyScore}%</span>
                </div>
              </div>
              <Badge className={`${getMetricRating(healthMetrics.latencyScore, { excellent: 95, good: 85, fair: 70 }).color} border`}>
                {getMetricRating(healthMetrics.latencyScore, { excellent: 95, good: 85, fair: 70 }).label}
              </Badge>
              <div className="mt-1 text-xs text-muted-foreground text-center">
                No change
              </div>
            </div>

            {/* Engagement */}
            <div className="p-4 lg:col-span-1 flex flex-col items-center justify-center hover:bg-gray-50/50 transition-colors cursor-pointer group">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                Engagement
                <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <div className="flex items-center justify-center mb-2">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="5" fill="none" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={healthMetrics.engagementRate >= 75 ? '#10b981' : healthMetrics.engagementRate >= 60 ? '#3b82f6' : '#f59e0b'}
                      strokeWidth="5" fill="none" strokeLinecap="round"
                      strokeDasharray={`${(healthMetrics.engagementRate / 100) * 163} 163`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{healthMetrics.engagementRate}%</span>
                </div>
              </div>
              <Badge className={`${getMetricRating(healthMetrics.engagementRate, { excellent: 90, good: 75, fair: 60 }).color} border`}>
                {getMetricRating(healthMetrics.engagementRate, { excellent: 90, good: 75, fair: 60 }).label}
              </Badge>
              <div className="mt-1 text-xs text-muted-foreground text-center">
                No change
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Issues Section */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4" />
            <CardTitle className="text-base">Top issues for sent rate</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {errorData.map((error, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    <span className="font-medium text-primary">{error.count} messages</span>
                    {' '}with{' '}
                    <span className="font-semibold">Error {error.code}</span>
                    <Info className="h-3 w-3 inline ml-1 text-muted-foreground" />
                  </span>
                </div>
                <Button variant="link" className="text-primary p-0 h-auto">
                  Review details <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="link" className="p-0 h-auto mt-4 text-primary">
            All Sent rate Errors
          </Button>
        </CardContent>
      </Card>

      {/* Recommendation Banner */}
      {showRecommendation && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Recommended to improve Sent Rate
                  </h3>
                  <p className="text-sm text-blue-800 mt-1">
                    We have identified <span className="font-bold">{formatNumber(healthMetrics.failed)}</span> failed or undelivered messages to unreachable or unavailable phone numbers. 
                    Line Type Intelligence, part of our <span className="font-semibold">Lookup API</span>, will make phone number details available to you before sending messages. 
                    Save <span className="font-bold text-green-700">${formatNumber(Math.round(healthMetrics.failed * 0.0075))}</span> in delivery charges in as little as 90 days.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      Explore Lookup API <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Learn more with AI
                    </Button>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      Is this helpful?
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setShowRecommendation(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Communication Trends Chart */}
      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 bg-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Communication Trends</CardTitle>
                <CardDescription className="text-xs">Messages and calls over time</CardDescription>
              </div>
              <Tabs value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
                <TabsList className="h-8">
                  <TabsTrigger value="day" className="text-xs px-2 h-6">Today</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs px-2 h-6">7 Days</TabsTrigger>
                  <TabsTrigger value="month" className="text-xs px-2 h-6">30 Days</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorCall" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '12px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)' }} />
                <Area type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMsg)" name="Messages" />
                <Area type="monotone" dataKey="calls" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCall)" name="Calls" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 bg-white border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Message Status</CardTitle>
            <CardDescription className="text-xs">Breakdown by delivery status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={messageStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                  {messageStatusData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 pt-3 border-t">
              {messageStatusData.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatNumber(item.value)}</span>
                    <span className="text-xs text-muted-foreground">
                      ({totalStatus > 0 ? ((item.value / totalStatus) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Messages</span>
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center"><MessageSquare className="h-4 w-4 text-blue-600" /></div>
            </div>
            <p className="text-2xl font-bold mt-2">{formatNumber(stats.totalMessages)}</p>
            <div className="flex items-center gap-1 mt-2">
              <Badge variant="outline" className={`${stats.messageGrowth >= 0 ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'} gap-1 text-xs`}>
                {stats.messageGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {stats.messageGrowth >= 0 ? '+' : ''}{stats.messageGrowth}%
              </Badge>
              <span className="text-xs text-muted-foreground">vs last week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Voice Calls</span>
              <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center"><Phone className="h-4 w-4 text-green-600" /></div>
            </div>
            <p className="text-2xl font-bold mt-2">{formatNumber(stats.totalCalls)}</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-muted-foreground">this week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Delivery Rate</span>
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-purple-600" /></div>
            </div>
            <p className="text-2xl font-bold mt-2">{stats.deliveryRate.toFixed(1)}%</p>
            <Progress value={stats.deliveryRate} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{stats.deliveryRate >= 80 ? 'Excellent' : stats.deliveryRate >= 60 ? 'Good' : stats.deliveryRate >= 40 ? 'Fair' : 'Needs improvement'}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Cost/Message</span>
              <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center"><DollarSign className="h-4 w-4 text-orange-600" /></div>
            </div>
            <p className="text-2xl font-bold mt-2">${stats.avgCost}</p>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-muted-foreground">per message</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Direction Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Message Direction</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2"><span className="text-sm flex items-center gap-2"><ArrowDownRight className="h-4 w-4 text-green-600" />Inbound</span><span className="font-semibold">{formatNumber(stats.inbound)}</span></div>
                <Progress value={(stats.inbound / (stats.inbound + stats.outbound || 1)) * 100} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between mb-2"><span className="text-sm flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-blue-600" />Outbound</span><span className="font-semibold">{formatNumber(stats.outbound)}</span></div>
                <Progress value={(stats.outbound / (stats.inbound + stats.outbound || 1)) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-lg"><p className="text-xs text-muted-foreground">Total This Month</p><p className="text-lg font-bold text-blue-600">{formatNumber(stats.totalMessages)}</p></div>
              <div className="p-3 bg-green-50 rounded-lg"><p className="text-xs text-muted-foreground">Calls This Week</p><p className="text-lg font-bold text-green-600">{formatNumber(stats.totalCalls)}</p></div>
              <div className="p-3 bg-purple-50 rounded-lg"><p className="text-xs text-muted-foreground">Success Rate</p><p className="text-lg font-bold text-purple-600">{stats.deliveryRate.toFixed(0)}%</p></div>
              <div className="p-3 bg-orange-50 rounded-lg"><p className="text-xs text-muted-foreground">Avg Cost</p><p className="text-lg font-bold text-orange-600">${stats.avgCost}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>
        </>
      )}

      {/* Phone Health Tab Content */}
      {activeTab === 'health' && (
        <PhoneHealthDashboard 
          data={phoneHealthData} 
          loading={healthLoading} 
          onRefresh={refreshHealth}
        />
      )}

      {/* Other tabs - placeholder for now */}
      {activeTab === 'delivery' && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery & Errors</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      )}

      {activeTab === 'response' && (
        <Card>
          <CardHeader>
            <CardTitle>Response Analytics</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      )}

      {activeTab === 'latency' && (
        <Card>
          <CardHeader>
            <CardTitle>Latency Metrics</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      )}

      {activeTab === 'engagement' && (
        <Card>
          <CardHeader>
            <CardTitle>Engagement Analytics</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
