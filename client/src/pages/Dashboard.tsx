import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccountAnalytics, formatNumber } from '../hooks/useTwilioData';
import { useLocation } from 'wouter';
import { 
  MessageSquare, 
  Phone, 
  TrendingUp,
  TrendingDown,
  Users,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Clock,
  CheckCircle,
  Send,
  BarChart3,
  Bell,
  FileText,
  Download,
  Calendar,
  MoreHorizontal,
  Info,
  ChevronDown,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import USStateHeatmap from '@/components/USStateHeatmap';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

// Mini sparkline component
const MiniSparkline = ({ data, color, trend }: { data: number[], color: string, trend: 'up' | 'down' }) => {
  const chartData = data.map((value, index) => ({ value }));
  return (
    <div className="w-20 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2} 
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { data: accountData, loading, error, refresh } = useAccountAnalytics();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [messageFilter, setMessageFilter] = useState('');
  const [selectedReportType, setSelectedReportType] = useState<'messages' | 'calls' | 'usage' | 'summary'>('messages');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState<'weekly' | 'monthly'>('weekly');
  
  // Date range filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [datePreset, setDatePreset] = useState<string>('last7days');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Live sending stats from in-memory active batch jobs (polls every 5 seconds)
  const [liveStats, setLiveStats] = useState<{ totalSent: number; totalFailed: number; totalInProgress: number; activeCampaigns: number } | null>(null);
  
  // Heatmap data - geographic distribution of messages by state
  const [heatmapData, setHeatmapData] = useState<{ state: string; count: number }[]>([]);
  
  useEffect(() => {
    const fetchLiveStats = async () => {
      try {
        const res = await fetch('/api/dashboard/live-stats');
        if (res.ok) {
          const data = await res.json();
          setLiveStats(data);
        }
      } catch { /* ignore */ }
    };
    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch heatmap data
  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const res = await fetch('/api/dashboard/heatmap');
        if (res.ok) {
          const data = await res.json();
          setHeatmapData(data.data || []);
        }
      } catch { /* ignore */ }
    };
    fetchHeatmap();
  }, []);

  // Transform account data to analytics format for compatibility
  // ALWAYS use aggregatedMetrics from server (DB source of truth) for stat cards
  const analytics = useMemo(() => {
    if (!accountData || accountData.accounts.length === 0) return null;
    
    // Merge messages/calls/phoneNumbers from all accounts
    const allMessages = accountData.accounts.flatMap(a => (a.analytics.messages as any)?.all || []);
    const allCalls = accountData.accounts.flatMap(a => (a.analytics.calls as any)?.all || []);
    const allPhoneNumbers = accountData.accounts.flatMap(a => a.analytics.phoneNumbers || []);
    const agg = accountData.aggregatedMetrics;
    
    return {
      account: accountData.accounts.length === 1 
        ? accountData.accounts[0].analytics.account 
        : { sid: 'merged', friendlyName: 'All Accounts', status: 'active', type: 'merged', dateCreated: new Date().toISOString() },
      phoneNumbers: allPhoneNumbers,
      messages: {
        ...accountData.messages,
        all: allMessages,
      },
      calls: {
        ...accountData.calls,
        all: allCalls,
      },
      metrics: {
        totalMessagesSentToday: agg.totalMessagesSentToday,
        totalMessagesReceivedToday: agg.totalMessagesReceivedToday,
        totalMessagesSentYesterday: (agg as any).totalMessagesSentYesterday ?? 0,
        totalMessagesReceivedYesterday: 0,
        totalMessagesSentThisWeek: agg.totalMessagesSentThisWeek,
        totalMessagesSentThisMonth: agg.totalMessagesSentThisMonth,
        totalMessagesSentLastWeek: (agg as any).totalMessagesSentLastWeek ?? 0,
        totalMessagesSentLastMonth: (agg as any).totalMessagesSentLastMonth ?? 0,
        deliveryRate: agg.deliveryRate,
        failureRate: agg.failureRate,
        totalCallsToday: agg.totalCallsToday,
        totalCallsYesterday: (agg as any).totalCallsYesterday ?? 0,
        totalCallsThisWeek: agg.totalCallsThisWeek,
        totalCallDurationToday: agg.totalCallDurationToday,
        totalSpendToday: agg.totalSpendToday,
        totalSpendThisMonth: agg.totalSpendThisMonth,
      },
    };
  }, [accountData]);

  const stats = useMemo(() => {
    if (!analytics) {
      return {
        messagesToday: 0, messagesThisWeek: 0, messagesThisMonth: 0,
        messageGrowth: 0, callsToday: 0, callGrowth: 0,
        activeNumbers: 0, deliveryRate: 0, deliveryGrowth: 0,
        inboundToday: 0, outboundToday: 0,
        totalMessagesToday: 0, totalCallsToday: 0,
        liveSending: 0, liveFailed: 0, activeCampaigns: 0,
      };
    }
    
    // Use aggregated metrics from DB as source of truth (uses ?? to handle 0 correctly)
    // Server already includes sms_campaigns.sent_count in these totals
    const metrics = analytics.metrics;
    const sentToday = metrics.totalMessagesSentToday ?? 0;
    const sentThisWeek = (metrics as any).totalMessagesSentThisWeek ?? 0;
    const sentThisMonth = (metrics as any).totalMessagesSentThisMonth ?? 0;
    const sentYesterday = (metrics as any).totalMessagesSentYesterday ?? 0;
    
    // Live stats are used only for the sending indicator badge (not added to totals)
    const liveSent = liveStats?.totalSent ?? 0;
    const liveFailed = liveStats?.totalFailed ?? 0;
    const activeCampaigns = liveStats?.activeCampaigns ?? 0;
    
    const callsToday = metrics.totalCallsToday ?? 0;
    const callsYesterday = (metrics as any).totalCallsYesterday ?? 0;
    
    // Growth: today vs yesterday
    const messageGrowth = sentYesterday > 0 
      ? Math.round(((sentToday - sentYesterday) / sentYesterday) * 100)
      : sentToday > 0 ? 100 : 0;
    
    const callGrowth = callsYesterday > 0 
      ? Math.round(((callsToday - callsYesterday) / callsYesterday) * 100)
      : callsToday > 0 ? 100 : 0;
    
    // Delivery rate: use the server-calculated rate (based on DB delivered/failed counts)
    const deliveryRate = (metrics as any).deliveryRate ?? 100;
    const deliveryGrowth = 0;
    
    const inboundToday = metrics.totalMessagesReceivedToday ?? 0;
    
    return {
      messagesToday: sentToday,
      messagesThisWeek: sentThisWeek,
      messagesThisMonth: sentThisMonth,
      messageGrowth,
      callsToday,
      callGrowth,
      activeNumbers: analytics.phoneNumbers?.length || 0,
      deliveryRate,
      deliveryGrowth,
      inboundToday,
      outboundToday: sentToday,
      totalMessagesToday: sentToday + inboundToday,
      totalCallsToday: callsToday,
      liveSending: liveSent,
      liveFailed: liveFailed,
      activeCampaigns,
    };
  }, [analytics, liveStats]);

  // Filtered stats based on date range - calculates totals from dailyChartData
  const filteredStats = useMemo(() => {
    const daily = accountData?.dailyChartData || [];
    
    if (!dateRange?.from || daily.length === 0) {
      return {
        totalMessages: stats.messagesThisMonth,
        totalOutbound: stats.messagesThisMonth,
        totalInbound: 0,
        avgPerDay: stats.messagesThisMonth > 0 ? Math.round(stats.messagesThisMonth / 30) : 0,
        daysInRange: 30,
        isFiltered: false,
      };
    }
    
    const from = dateRange.from;
    const to = dateRange.to || new Date();
    
    // Filter daily data by date range
    const filteredDaily = daily.filter((d: any) => {
      const date = new Date(d.date);
      return date >= from && date <= to;
    });
    
    // Calculate totals from filtered data
    const totalOutbound = filteredDaily.reduce((sum: number, d: any) => sum + (d.outbound || 0), 0);
    const totalInbound = filteredDaily.reduce((sum: number, d: any) => sum + (d.inbound || 0), 0);
    const totalMessages = totalOutbound + totalInbound;
    const daysInRange = filteredDaily.length || 1;
    const avgPerDay = daysInRange > 0 ? Math.round(totalMessages / daysInRange) : 0;
    
    return {
      totalMessages,
      totalOutbound,
      totalInbound,
      avgPerDay,
      daysInRange,
      isFiltered: true,
    };
  }, [accountData, dateRange, stats.messagesThisMonth]);

  // Get label for the date range
  const getDateRangeLabel = () => {
    if (!dateRange?.from) return 'This Month';
    if (datePreset === 'today') return 'Today';
    if (datePreset === 'yesterday') return 'Yesterday';
    if (datePreset === 'thisWeek') return 'This Week';
    if (datePreset === 'last7days') return 'Last 7 Days';
    if (datePreset === 'last30days') return 'Last 30 Days';
    if (datePreset === 'thisMonth') return 'This Month';
    if (datePreset === 'lastMonth') return 'Last Month';
    if (datePreset === 'last3months') return 'Last 3 Months';
    if (datePreset === 'last6months') return 'Last 6 Months';
    return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to || new Date(), 'MMM d')}`;
  };

  // Handle date preset changes
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    let from: Date;
    let to: Date = today;
    
    switch (preset) {
      case 'today':
        from = today;
        break;
      case 'yesterday':
        from = subDays(today, 1);
        to = subDays(today, 1);
        break;
      case 'last7days':
        from = subDays(today, 7);
        break;
      case 'last30days':
        from = subDays(today, 30);
        break;
      case 'thisMonth':
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case 'lastMonth':
        from = startOfMonth(subMonths(today, 1));
        to = endOfMonth(subMonths(today, 1));
        break;
      case 'thisWeek':
        from = startOfWeek(today, { weekStartsOn: 0 });
        to = endOfWeek(today, { weekStartsOn: 0 });
        break;
      case 'last3months':
        from = subMonths(today, 3);
        break;
      case 'last6months':
        from = subMonths(today, 6);
        break;
      default:
        from = subDays(today, 7);
    }
    
    setDateRange({ from, to });
  };

  // Chart data for the weekly view - uses server dailyChartData (includes campaigns + sms_messages)
  // Filters based on selected date range
  const weeklyChartData = useMemo(() => {
    const daily = accountData?.dailyChartData || [];
    
    // Filter by date range if set
    const filteredDaily = daily.filter((d: any) => {
      if (!dateRange?.from) return true;
      const date = new Date(d.date);
      const from = dateRange.from;
      const to = dateRange.to || new Date();
      return date >= from && date <= to;
    });
    
    return filteredDaily.map((d: any) => {
      // Parse date and display in user's local timezone
      const date = new Date(d.date);
      return {
        name: `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getMonth() + 1}/${date.getDate()}`,
        messages: (d.outbound || 0) + (d.inbound || 0),
        calls: 0
      };
    });
  }, [accountData, dateRange]);
  
  // Monthly trend data - aggregates dailyChartData by month (using UTC)
  const sixMonthTrendData = useMemo(() => {
    const daily = accountData?.dailyChartData || [];
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    
    return Array.from({ length: 6 }, (_, i) => {
      const monthDate = new Date(Date.UTC(currentYear, currentMonth - (5 - i), 1));
      const nextMonth = new Date(Date.UTC(currentYear, currentMonth - (4 - i), 1));
      
      const monthTotal = daily
        .filter((d: any) => {
          const dd = new Date(d.date + 'T00:00:00Z');
          return dd >= monthDate && dd < nextMonth;
        })
        .reduce((sum: number, d: any) => sum + (d.outbound || 0) + (d.inbound || 0), 0);
      
      return {
        name: monthDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        messages: monthTotal,
        calls: 0
      };
    });
  }, [accountData]);

  // Bar chart data - uses server dailyChartData for last 14 days (UTC)
  const barChartData = useMemo(() => {
    const daily = accountData?.dailyChartData || [];
    
    // Get last 14 days from server data directly
    const last14Days = daily.slice(-14);
    
    return last14Days.map((d: any) => {
      const date = new Date(d.date + 'T00:00:00Z');
      return {
        name: date.getUTCDate().toString(),
        value: (d.outbound || 0) + (d.inbound || 0)
      };
    });
  }, [accountData]);

  // Recent messages for table
  const recentMessages = useMemo(() => {
    if (!analytics) return [];
    return (analytics.messages.today?.length > 0 ? analytics.messages.today : analytics.messages.thisMonth)?.slice(0, 5).map((m: any) => ({
      id: m.sid,
      status: m.status === 'delivered' ? 'Success' : m.status === 'sent' ? 'Processing' : 'Failed',
      to: m.to,
      body: m.body.substring(0, 30) + '...',
      timestamp: m.dateSent
    }));
  }, [analytics]);

  // Team members / Active users
  const teamMembers = [
    { name: 'Dale Komen', email: 'dale@example.com', role: 'Member', avatar: 'DK' },
    { name: 'Sofia Davis', email: 'm@example.com', role: 'Owner', avatar: 'SD' },
    { name: 'Jackson Lee', email: 'p@example.com', role: 'Member', avatar: 'JL' },
    { name: 'Isabella Nguyen', email: 'i@example.com', role: 'Member', avatar: 'IN' },
    { name: 'Hugan Romex', email: 'kai@example.com', role: 'Member', avatar: 'HR' },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Success':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Success</Badge>;
      case 'Processing':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Processing</Badge>;
      case 'Failed':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // CSV Download helper
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Messages CSV
  const generateMessagesCSV = () => {
    if (!analytics) return 'No data available';
    const headers = ['SID', 'To', 'From', 'Body', 'Status', 'Direction', 'Date Sent', 'Price'];
    const rows = analytics.messages.thisMonth?.map((m: any) => [
      m.sid,
      m.to,
      m.from,
      `"${m.body.replace(/"/g, '""')}"`,
      m.status,
      m.direction,
      new Date(m.dateSent).toLocaleString(),
      m.price || 'N/A'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  };

  // Generate Calls CSV
  const generateCallsCSV = () => {
    if (!analytics) return 'No data available';
    const headers = ['SID', 'To', 'From', 'Status', 'Direction', 'Duration (s)', 'Start Time', 'End Time', 'Price'];
    const rows = analytics.calls.thisMonth?.map((c: any) => [
      c.sid,
      c.to,
      c.from,
      c.status,
      c.direction,
      c.duration,
      new Date(c.startTime).toLocaleString(),
      new Date(c.endTime).toLocaleString(),
      c.price || 'N/A'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  };

  // Generate Usage CSV
  const generateUsageCSV = () => {
    if (!analytics) return 'No data available';
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Messages Sent Today', stats.messagesToday.toString()],
      ['Total Calls Today', stats.callsToday.toString()],
      ['Active Phone Numbers', stats.activeNumbers.toString()],
      ['Delivery Rate', `${stats.deliveryRate.toFixed(1)}%`],
      ['Inbound Messages Today', stats.inboundToday.toString()],
      ['Outbound Messages Today', stats.outboundToday.toString()],
      ['Report Generated', new Date().toLocaleString()]
    ];
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  };

  // Generate Summary CSV
  const generateSummaryCSV = () => {
    if (!analytics) return 'No data available';
    let csv = '=== TEXTFLOW COMMUNICATION REPORT ===\n';
    csv += `Generated: ${new Date().toLocaleString()}\n`;
    csv += `Account SID: ${analytics.account?.sid || 'N/A'}\n\n`;
    
    csv += '=== SUMMARY METRICS ===\n';
    csv += `Total Messages Today,${stats.messagesToday}\n`;
    csv += `Total Calls Today,${stats.callsToday}\n`;
    csv += `Active Phone Numbers,${stats.activeNumbers}\n`;
    csv += `Delivery Rate,${stats.deliveryRate.toFixed(1)}%\n`;
    csv += `Inbound Messages Today,${stats.inboundToday}\n`;
    csv += `Outbound Messages Today,${stats.outboundToday}\n\n`;
    
    csv += '=== MESSAGES (This Month) ===\n';
    csv += generateMessagesCSV() + '\n\n';
    
    csv += '=== CALLS (This Month) ===\n';
    csv += generateCallsCSV();
    
    return csv;
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="default" size="sm" className="gap-2 bg-gray-900 hover:bg-gray-800">
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 min-w-[200px] justify-start">
                <Calendar className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  "Pick a date"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 border-b">
                <Select value={datePreset} onValueChange={handleDatePresetChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="thisWeek">This Week</SelectItem>
                    <SelectItem value="last7days">Last 7 Days</SelectItem>
                    <SelectItem value="last30days">Last 30 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="last3months">Last 3 Months</SelectItem>
                    <SelectItem value="last6months">Last 6 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  setDatePreset('custom');
                }}
                numberOfMonths={2}
              />
              <div className="p-3 border-t flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    handleDatePresetChange('last7days');
                  }}
                >
                  Reset
                </Button>
                <Button 
                  size="sm"
                  onClick={() => setIsDatePickerOpen(false)}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="space-y-6 mt-6">
          {/* Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Total Outbound - filtered by date range */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Send className="h-4 w-4" />
                    Outbound ({getDateRangeLabel()})
                  </div>
                  {stats.activeCampaigns > 0 && (
                    <Badge className="gap-1 text-xs bg-green-100 text-green-700 border-green-200 animate-pulse">
                      <Activity className="h-3 w-3" />
                      {stats.activeCampaigns} sending
                    </Badge>
                  )}
                </div>
                <p className="text-3xl font-bold mt-3">{loading ? '...' : formatNumber(filteredStats.totalOutbound)}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  {stats.liveFailed > 0 && (
                    <span className="text-xs text-red-500">Failed: {formatNumber(stats.liveFailed)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {filteredStats.daysInRange} day{filteredStats.daysInRange !== 1 ? 's' : ''} selected
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Total Messages - filtered by date range */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  Total Messages
                </div>
                <p className="text-3xl font-bold mt-3">{loading ? '...' : formatNumber(filteredStats.totalMessages)}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">Avg {formatNumber(filteredStats.avgPerDay)}/day</span>
                </div>
              </CardContent>
            </Card>

            {/* Inbound Messages - filtered by date range */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Inbound Messages
                </div>
                <p className="text-3xl font-bold mt-3">{loading ? '...' : formatNumber(filteredStats.totalInbound)}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">{stats.activeNumbers} numbers active</span>
                  <Badge variant="outline" className="gap-1 text-xs text-blue-600 border-blue-200 bg-blue-50">
                    <Activity className="h-3 w-3" />
                    {stats.activeNumbers}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Rate */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                  Delivery Rate
                </div>
                <p className="text-3xl font-bold mt-3">{loading ? '...' : stats.deliveryRate.toFixed(1)}%</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">{getDateRangeLabel()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Calls - shows today's calls */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  Calls Today
                </div>
                <p className="text-3xl font-bold mt-3">{loading ? '...' : formatNumber(stats.callsToday)}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">vs yesterday</span>
                  <Badge variant="outline" className={`gap-1 text-xs ${stats.callGrowth >= 0 ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
                    {stats.callGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(stats.callGrowth)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Large Area Chart - stretches to match sidebar height */}
            <Card className="lg:col-span-2 bg-white flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
                <div>
                  <CardTitle className="text-base font-medium">
                    Communication Activity - {chartTimeRange === 'weekly' ? 'Weekly' : 'Monthly'}
                  </CardTitle>
                  <CardDescription>
                    {chartTimeRange === 'weekly' 
                      ? (dateRange?.from && dateRange?.to 
                          ? `Showing activity from ${format(dateRange.from, 'MMM d')} to ${format(dateRange.to, 'MMM d, yyyy')}`
                          : 'Showing activity for the last 7 days')
                      : 'Showing total activity for the last 6 months'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant={chartTimeRange === 'weekly' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setChartTimeRange('weekly')}
                  >
                    Weekly
                  </Button>
                  <Button 
                    variant={chartTimeRange === 'monthly' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setChartTimeRange('monthly')}
                  >
                    Monthly
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0">
                {loading ? (
                  <div className="h-full min-h-[300px] flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="h-full min-h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartTimeRange === 'weekly' ? weeklyChartData : sixMonthTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMessages2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCalls2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="messages" stroke="#14b8a6" strokeWidth={2} fillOpacity={1} fill="url(#colorMessages2)" name="Messages" />
                        <Area type="monotone" dataKey="calls" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorCalls2)" name="Calls" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Side Cards */}
            <div className="space-y-3">
              {/* Subscriptions / Messages Card */}
              <Card className="bg-white">
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Outbound Today</div>
                  <p className="text-2xl font-bold mt-1">{formatNumber(stats.messagesToday)}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {stats.messageGrowth >= 0 ? '+' : ''}{stats.messageGrowth}% vs yesterday
                  </p>
                  <div className="mt-2 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData}>
                        <Bar dataKey="value" fill="#f97316" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Voice Calls Card */}
              <Card className="bg-white">
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Voice Calls Today</div>
                  <p className="text-2xl font-bold mt-1">{formatNumber(stats.totalCallsToday)}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {stats.callGrowth >= 0 ? '+' : ''}{stats.callGrowth}% vs yesterday
                  </p>
                  <div className="mt-2 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData.slice(0, 8)}>
                        <Bar dataKey="value" fill="#14b8a6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Message Heatmap - Compact Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-white">
              <CardContent className="p-4">
                <USStateHeatmap 
                  data={heatmapData}
                  title="Message Heatmap"
                  subtitle="Geographic distribution across states"
                />
              </CardContent>
            </Card>
            
            {/* Delivery Stats Card */}
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Top Sending States</CardTitle>
                <CardDescription>Message volume by state</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {heatmapData
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8)
                    .map((item, i) => (
                      <div key={item.state} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium w-6">{i + 1}.</span>
                          <span className="text-sm font-bold text-red-600">{item.state}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-red-500 rounded-full" 
                              style={{ width: `${(item.count / (heatmapData[0]?.count || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">{item.count.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Messages Table */}
            <Card className="lg:col-span-2 bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">Recent Messages</CardTitle>
                    <CardDescription>View your recent communications.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <Input 
                    placeholder="Filter messages..." 
                    className="max-w-sm"
                    value={messageFilter}
                    onChange={(e) => setMessageFilter(e.target.value)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="ml-auto">
                        Columns <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>Status</DropdownMenuItem>
                      <DropdownMenuItem>To</DropdownMenuItem>
                      <DropdownMenuItem>Message</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox />
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="text-right">Message</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                          </TableCell>
                        </TableRow>
                      ) : recentMessages.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No messages found
                          </TableCell>
                        </TableRow>
                      ) : (
                        recentMessages.filter(m => 
                          messageFilter === '' || 
                          m.to.toLowerCase().includes(messageFilter.toLowerCase()) ||
                          m.body.toLowerCase().includes(messageFilter.toLowerCase())
                        ).map((message) => (
                          <TableRow key={message.id}>
                            <TableCell>
                              <Checkbox />
                            </TableCell>
                            <TableCell>{getStatusBadge(message.status)}</TableCell>
                            <TableCell className="font-medium">{message.to}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{message.body}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Account Information */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-base font-medium">Account Information</CardTitle>
                <CardDescription>Your Twilio account credentials and settings.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Account SID */}
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                        <Activity className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Account SID</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {analytics?.account?.sid?.substring(0, 16)}...
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        if (analytics?.account?.sid) {
                          navigator.clipboard.writeText(analytics.account.sid);
                        }
                      }}
                    >
                      Copy
                    </Button>
                  </div>

                  {/* Auth Token */}
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setLocation('/settings')}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Auth Token</p>
                        <p className="text-xs text-muted-foreground font-mono">••••••••••••••••</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </div>

                  {/* API Keys */}
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setLocation('/api-integration')}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
                        <Settings className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">API Keys</p>
                        <p className="text-xs text-muted-foreground">Manage API access</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Manage
                    </Button>
                  </div>

                  {/* Providers */}
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setLocation('/settings')}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
                        <Users className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Providers</p>
                        <p className="text-xs text-muted-foreground">Twilio, Commio</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Configure
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
