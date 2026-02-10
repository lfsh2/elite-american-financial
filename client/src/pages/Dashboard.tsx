import React, { useState, useMemo } from 'react';
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
  const [chartTimeRange, setChartTimeRange] = useState<'weekly' | 'monthly'>('monthly');

  // Transform account data to analytics format for compatibility
  const analytics = useMemo(() => {
    if (!accountData || accountData.accounts.length === 0) return null;
    
    // Use first account's analytics or merge all
    if (accountData.accounts.length === 1) {
      return accountData.accounts[0].analytics;
    }
    
    // For multiple accounts, create merged structure
    // Aggregate 'all' messages and calls from all accounts
    const allMessages = accountData.accounts.flatMap(a => (a.analytics.messages as any)?.all || []);
    const allCalls = accountData.accounts.flatMap(a => (a.analytics.calls as any)?.all || []);
    
    return {
      account: {
        sid: 'merged',
        friendlyName: 'All Accounts',
        status: 'active',
        type: 'merged',
        dateCreated: new Date().toISOString(),
      },
      phoneNumbers: accountData.accounts.flatMap(a => a.analytics.phoneNumbers || []),
      messages: {
        ...accountData.messages,
        all: allMessages,
      },
      calls: {
        ...accountData.calls,
        all: allCalls,
      },
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
  }, [accountData]);

  const stats = useMemo(() => {
    if (!analytics) {
      return {
        messagesToday: 0, messageGrowth: 0, callsToday: 0, callGrowth: 0,
        activeNumbers: 0, deliveryRate: 0, deliveryGrowth: 0,
        inboundToday: 0, outboundToday: 0,
        totalMessagesToday: 0, totalCallsToday: 0,
      };
    }
    
    // TODAY's data
    const messagesToday = analytics.messages.today?.length || 0;
    const messagesYesterday = (analytics.messages as any).yesterday?.length || 0;
    const callsToday = analytics.calls.today?.length || 0;
    const callsYesterday = (analytics.calls as any).yesterday?.length || 0;
    
    // Growth: today vs yesterday
    const messageGrowth = messagesYesterday > 0 
      ? Math.round(((messagesToday - messagesYesterday) / messagesYesterday) * 100)
      : messagesToday > 0 ? 100 : 0;
    
    const callGrowth = callsYesterday > 0 
      ? Math.round(((callsToday - callsYesterday) / callsYesterday) * 100)
      : callsToday > 0 ? 100 : 0;
    
    // Delivery rate from today's outbound messages
    const outboundToday = analytics.messages.today?.filter((m: any) => m.direction?.startsWith('outbound')) || [];
    const deliveredToday = outboundToday.filter((m: any) => m.status === 'delivered' || m.status === 'sent').length;
    const failedToday = outboundToday.filter((m: any) => m.status === 'failed' || m.status === 'undelivered').length;
    const deliveryRate = outboundToday.length > 0 
      ? (deliveredToday / outboundToday.length) * 100 
      : (analytics.metrics as any).deliveryRate || 100;
    
    // Yesterday's delivery rate for comparison
    const outboundYesterday = (analytics.messages as any).yesterday?.filter((m: any) => m.direction?.startsWith('outbound')) || [];
    const deliveredYesterday = outboundYesterday.filter((m: any) => m.status === 'delivered' || m.status === 'sent').length;
    const yesterdayRate = outboundYesterday.length > 0 ? (deliveredYesterday / outboundYesterday.length) * 100 : 0;
    const deliveryGrowth = yesterdayRate > 0 
      ? Math.round(deliveryRate - yesterdayRate)
      : 0;
    
    const inboundToday = analytics.messages.today?.filter((m: any) => m.direction === 'inbound').length || 0;
    
    return {
      messagesToday: analytics.metrics.totalMessagesSentToday || outboundToday.length,
      messageGrowth,
      callsToday: analytics.metrics.totalCallsToday || callsToday,
      callGrowth,
      activeNumbers: analytics.phoneNumbers?.length || 0,
      deliveryRate,
      deliveryGrowth,
      inboundToday,
      outboundToday: outboundToday.length,
      totalMessagesToday: messagesToday,
      totalCallsToday: callsToday,
    };
  }, [analytics]);

  // Chart data for the weekly view - shows past 7 days with daily breakdown
  const weeklyChartData = useMemo(() => {
    if (!analytics) {
      return Array.from({ length: 7 }, (_, i) => ({ 
        name: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i], 
        messages: 0, 
        calls: 0 
      }));
    }
    
    const now = new Date();
    // Use 'all' data if available (6 months), otherwise fall back to thisMonth
    const allMessages = (analytics.messages as any).all || analytics.messages.thisMonth || [];
    const allCalls = (analytics.calls as any).all || analytics.calls.thisMonth || [];
    
    console.log('[Dashboard] Weekly chart - Total messages available:', allMessages.length);
    console.log('[Dashboard] Weekly chart - Total calls available:', allCalls.length);
    
    // Group by day for the last 7 days
    const chartData = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Count messages for this day
      const dayMessages = allMessages.filter((m: any) => {
        const msgDate = new Date(m.dateSent);
        return msgDate >= date && msgDate < nextDate;
      }).length;
      
      // Count calls for this day
      const dayCalls = allCalls.filter((c: any) => {
        const callDate = new Date(c.startTime);
        return callDate >= date && callDate < nextDate;
      }).length;
      
      return {
        name: `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getMonth() + 1}/${date.getDate()}`,
        messages: dayMessages,
        calls: dayCalls
      };
    });
    
    console.log('[Dashboard] Weekly chart data:', chartData);
    return chartData;
  }, [analytics]);
  
  // Monthly trend data - shows last 6 months
  const sixMonthTrendData = useMemo(() => {
    if (!analytics) {
      return Array.from({ length: 6 }, (_, i) => ({ 
        name: new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 1)
          .toLocaleDateString('en-US', { month: 'short' }), 
        messages: 0, 
        calls: 0 
      }));
    }
    
    const now = new Date();
    const allMessages = (analytics.messages as any).all || analytics.messages.thisMonth || [];
    const allCalls = (analytics.calls as any).all || analytics.calls.thisMonth || [];
    
    // Group by month for the last 6 months
    return Array.from({ length: 6 }, (_, i) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
      
      const monthMessages = allMessages.filter((m: any) => {
        const msgDate = new Date(m.dateSent);
        return msgDate >= monthDate && msgDate < nextMonth;
      }).length;
      
      const monthCalls = allCalls.filter((c: any) => {
        const callDate = new Date(c.startTime);
        return callDate >= monthDate && callDate < nextMonth;
      }).length;
      
      return {
        name: monthDate.toLocaleDateString('en-US', { month: 'short' }),
        messages: monthMessages,
        calls: monthCalls
      };
    });
  }, [analytics]);

  // Bar chart data - uses real daily message counts from this month
  const barChartData = useMemo(() => {
    if (!analytics) {
      return Array.from({ length: 14 }, (_, i) => ({ name: (i + 1).toString(), value: 0 }));
    }
    
    const now = new Date();
    // Get last 14 days of message data
    return Array.from({ length: 14 }, (_, i) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (13 - i));
      const dateStr = date.toDateString();
      
      const dayMessages = analytics.messages.thisMonth?.filter((m: any) => {
        const msgDate = new Date(m.dateSent);
        return msgDate.toDateString() === dateStr;
      }).length || 0;
      
      return {
        name: date.getDate().toString(),
        value: dayMessages
      };
    });
  }, [analytics]);

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

  // Sparkline data - derived from real daily message/call counts
  const sparklineMessages = useMemo(() => {
    if (!analytics) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    return Array.from({ length: 10 }, (_, i) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (9 - i));
      const dateStr = date.toDateString();
      return analytics.messages.thisMonth?.filter((m: any) => {
        const msgDate = new Date(m.dateSent);
        return msgDate.toDateString() === dateStr;
      }).length || 0;
    });
  }, [analytics]);

  const sparklineCalls = useMemo(() => {
    if (!analytics) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    return Array.from({ length: 10 }, (_, i) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (9 - i));
      const dateStr = date.toDateString();
      return analytics.calls.thisMonth?.filter((c: any) => {
        const callDate = new Date(c.startTime);
        return callDate.toDateString() === dateStr;
      }).length || 0;
    });
  }, [analytics]);

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
          <Button variant="default" size="sm" className="gap-2 bg-gray-900 hover:bg-gray-800">
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="h-4 w-4" />
            Pick a date
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border">
          <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-gray-100">
            <Settings className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Messages Card */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    Messages Today
                  </div>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="text-3xl font-bold">{loading ? '...' : formatNumber(stats.messagesToday)}</p>
                    <p className="text-xs text-muted-foreground mt-1">vs yesterday</p>
                  </div>
                  <MiniSparkline data={sparklineMessages} color="#f97316" trend="up" />
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-sm text-muted-foreground">Details</span>
                  <Badge variant="outline" className={`gap-1 ${stats.messageGrowth >= 0 ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'}`}>
                    {stats.messageGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(stats.messageGrowth)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Calls Card */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    Calls Today
                  </div>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="text-3xl font-bold">{loading ? '...' : formatNumber(stats.callsToday)}</p>
                    <p className="text-xs text-muted-foreground mt-1">vs yesterday</p>
                  </div>
                  <MiniSparkline data={sparklineCalls} color="#ef4444" trend="down" />
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-sm text-muted-foreground">Details</span>
                  <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
                    <ArrowDownRight className="h-3 w-3" />
                    {Math.abs(stats.callGrowth)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Rate Card */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4" />
                    Inbound Today
                  </div>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="text-3xl font-bold">{loading ? '...' : stats.inboundToday}</p>
                    <p className="text-xs text-muted-foreground mt-1">Received today</p>
                  </div>
                  <MiniSparkline data={sparklineMessages} color="#f97316" trend="up" />
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-sm text-muted-foreground">{stats.activeNumbers} numbers active</span>
                  <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 bg-blue-50">
                    <Activity className="h-3 w-3" />
                    {stats.activeNumbers}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Total Revenue / Delivery Rate */}
            <Card className="bg-white">
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">Delivery Rate Today</div>
                <p className="text-3xl font-bold mt-2">{stats.deliveryRate.toFixed(1)}%</p>
                <p className="text-xs text-green-600 mt-1">{stats.deliveryGrowth >= 0 ? '+' : ''}{stats.deliveryGrowth}% vs yesterday</p>
                <div className="mt-4 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineMessages.map((v: number) => ({ value: v }))}>
                      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Large Area Chart */}
            <Card className="lg:col-span-2 bg-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium">
                    Communication Activity - {chartTimeRange === 'weekly' ? 'Weekly' : 'Monthly'}
                  </CardTitle>
                  <CardDescription>
                    {chartTimeRange === 'weekly' 
                      ? 'Showing activity for the last 7 days' 
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
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="h-[300px]">
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
            <div className="space-y-6">
              {/* Subscriptions / Messages Card */}
              <Card className="bg-white">
                <CardContent className="p-6">
                  <div className="text-sm text-muted-foreground">Total Messages Today</div>
                  <p className="text-3xl font-bold mt-1">{formatNumber(stats.totalMessagesToday)}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {stats.messageGrowth >= 0 ? '+' : ''}{stats.messageGrowth}% vs yesterday
                  </p>
                  <div className="mt-4 h-24">
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
                <CardContent className="p-6">
                  <div className="text-sm text-muted-foreground">Voice Calls Today</div>
                  <p className="text-3xl font-bold mt-1">{formatNumber(stats.totalCallsToday)}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {stats.callGrowth >= 0 ? '+' : ''}{stats.callGrowth}% vs yesterday
                  </p>
                  <div className="mt-4 h-24">
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
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Card className="bg-white">
            <CardContent className="p-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Analytics</h3>
              <p className="text-muted-foreground mt-2">Detailed analytics coming soon.</p>
              <Button className="mt-4" onClick={() => setLocation('/analytics')}>
                Go to Analytics Page
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-6 space-y-6">
          {/* Report Type Selection Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Messages Report */}
            <Card 
              className={`bg-white cursor-pointer transition-all duration-200 hover:shadow-lg ${selectedReportType === 'messages' ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : 'hover:border-blue-200'}`}
              onClick={() => setSelectedReportType('messages')}
            >
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${selectedReportType === 'messages' ? 'bg-blue-500' : 'bg-blue-100'}`}>
                    <MessageSquare className={`h-6 w-6 ${selectedReportType === 'messages' ? 'text-white' : 'text-blue-600'}`} />
                  </div>
                  <h3 className="font-semibold text-sm">Messages</h3>
                  <p className="text-xs text-muted-foreground mt-1">SMS & MMS logs</p>
                  <div className="mt-3 pt-3 border-t w-full">
                    <p className="text-xl font-bold text-blue-600">{formatNumber(stats.messagesSent)}</p>
                    <p className="text-[10px] text-muted-foreground">This Month</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Calls Report */}
            <Card 
              className={`bg-white cursor-pointer transition-all duration-200 hover:shadow-lg ${selectedReportType === 'calls' ? 'ring-2 ring-green-500 shadow-lg scale-[1.02]' : 'hover:border-green-200'}`}
              onClick={() => setSelectedReportType('calls')}
            >
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${selectedReportType === 'calls' ? 'bg-green-500' : 'bg-green-100'}`}>
                    <Phone className={`h-6 w-6 ${selectedReportType === 'calls' ? 'text-white' : 'text-green-600'}`} />
                  </div>
                  <h3 className="font-semibold text-sm">Voice Calls</h3>
                  <p className="text-xs text-muted-foreground mt-1">Call history</p>
                  <div className="mt-3 pt-3 border-t w-full">
                    <p className="text-xl font-bold text-green-600">{formatNumber(stats.callsMade)}</p>
                    <p className="text-[10px] text-muted-foreground">This Week</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage Report */}
            <Card 
              className={`bg-white cursor-pointer transition-all duration-200 hover:shadow-lg ${selectedReportType === 'usage' ? 'ring-2 ring-purple-500 shadow-lg scale-[1.02]' : 'hover:border-purple-200'}`}
              onClick={() => setSelectedReportType('usage')}
            >
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${selectedReportType === 'usage' ? 'bg-purple-500' : 'bg-purple-100'}`}>
                    <BarChart3 className={`h-6 w-6 ${selectedReportType === 'usage' ? 'text-white' : 'text-purple-600'}`} />
                  </div>
                  <h3 className="font-semibold text-sm">Usage</h3>
                  <p className="text-xs text-muted-foreground mt-1">API usage stats</p>
                  <div className="mt-3 pt-3 border-t w-full">
                    <p className="text-xl font-bold text-purple-600">{stats.activeNumbers}</p>
                    <p className="text-[10px] text-muted-foreground">Active Numbers</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Report */}
            <Card 
              className={`bg-white cursor-pointer transition-all duration-200 hover:shadow-lg ${selectedReportType === 'summary' ? 'ring-2 ring-orange-500 shadow-lg scale-[1.02]' : 'hover:border-orange-200'}`}
              onClick={() => setSelectedReportType('summary')}
            >
              <CardContent className="p-5">
                <div className="flex flex-col items-center text-center">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${selectedReportType === 'summary' ? 'bg-orange-500' : 'bg-orange-100'}`}>
                    <FileText className={`h-6 w-6 ${selectedReportType === 'summary' ? 'text-white' : 'text-orange-600'}`} />
                  </div>
                  <h3 className="font-semibold text-sm">Summary</h3>
                  <p className="text-xs text-muted-foreground mt-1">Full overview</p>
                  <div className="mt-3 pt-3 border-t w-full">
                    <p className="text-xl font-bold text-orange-600">{stats.deliveryRate.toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground">Delivery Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Report Details & Actions */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Report Preview Card */}
            <Card className="lg:col-span-2 bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      selectedReportType === 'messages' ? 'bg-blue-100' :
                      selectedReportType === 'calls' ? 'bg-green-100' :
                      selectedReportType === 'usage' ? 'bg-purple-100' : 'bg-orange-100'
                    }`}>
                      {selectedReportType === 'messages' && <MessageSquare className="h-5 w-5 text-blue-600" />}
                      {selectedReportType === 'calls' && <Phone className="h-5 w-5 text-green-600" />}
                      {selectedReportType === 'usage' && <BarChart3 className="h-5 w-5 text-purple-600" />}
                      {selectedReportType === 'summary' && <FileText className="h-5 w-5 text-orange-600" />}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {selectedReportType.charAt(0).toUpperCase() + selectedReportType.slice(1)} Report
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {selectedReportType === 'messages' && 'All SMS and MMS message logs'}
                        {selectedReportType === 'calls' && 'Voice call history and duration'}
                        {selectedReportType === 'usage' && 'API usage statistics'}
                        {selectedReportType === 'summary' && 'Comprehensive summary'}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedReportType === 'messages' && `${analytics?.messages.thisMonth.length || 0} records`}
                    {selectedReportType === 'calls' && `${analytics?.calls.thisMonth.length || 0} records`}
                    {selectedReportType === 'usage' && '7 metrics'}
                    {selectedReportType === 'summary' && 'Full export'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Preview</p>
                    <p className="text-xs text-muted-foreground">Showing first 5 records</p>
                  </div>
                  <div className="max-h-52 overflow-auto">
                    {selectedReportType === 'messages' && (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="text-xs h-9">To</TableHead>
                            <TableHead className="text-xs h-9">Status</TableHead>
                            <TableHead className="text-xs h-9">Direction</TableHead>
                            <TableHead className="text-xs h-9">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(analytics?.messages.thisMonth || []).slice(0, 5).map((m: any, i: number) => (
                            <TableRow key={i} className="hover:bg-gray-50">
                              <TableCell className="text-xs font-mono py-2">{m.to}</TableCell>
                              <TableCell className="py-2">
                                <Badge variant={m.status === 'delivered' ? 'default' : 'secondary'} className="text-[10px] h-5">
                                  {m.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs py-2">{m.direction}</TableCell>
                              <TableCell className="text-xs text-muted-foreground py-2">{new Date(m.dateSent).toLocaleDateString()}</TableCell>
                            </TableRow>
                          ))}
                          {(!analytics?.messages.thisMonth || analytics.messages.thisMonth.length === 0) && (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No messages found</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                    {selectedReportType === 'calls' && (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="text-xs h-9">To</TableHead>
                            <TableHead className="text-xs h-9">Duration</TableHead>
                            <TableHead className="text-xs h-9">Status</TableHead>
                            <TableHead className="text-xs h-9">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(analytics?.calls.thisMonth || []).slice(0, 5).map((c: any, i: number) => (
                            <TableRow key={i} className="hover:bg-gray-50">
                              <TableCell className="text-xs font-mono py-2">{c.to}</TableCell>
                              <TableCell className="text-xs py-2">{c.duration}s</TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline" className="text-[10px] h-5">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground py-2">{new Date(c.startTime).toLocaleDateString()}</TableCell>
                            </TableRow>
                          ))}
                          {(!analytics?.calls.thisMonth || analytics.calls.thisMonth.length === 0) && (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No calls found</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                    {selectedReportType === 'usage' && (
                      <div className="p-4 grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded-lg"><p className="text-xs text-muted-foreground">Messages Sent</p><p className="text-lg font-bold text-blue-600">{stats.messagesSent}</p></div>
                        <div className="p-3 bg-green-50 rounded-lg"><p className="text-xs text-muted-foreground">Calls Made</p><p className="text-lg font-bold text-green-600">{stats.callsMade}</p></div>
                        <div className="p-3 bg-purple-50 rounded-lg"><p className="text-xs text-muted-foreground">Active Numbers</p><p className="text-lg font-bold text-purple-600">{stats.activeNumbers}</p></div>
                        <div className="p-3 bg-orange-50 rounded-lg"><p className="text-xs text-muted-foreground">Delivery Rate</p><p className="text-lg font-bold text-orange-600">{stats.deliveryRate}%</p></div>
                      </div>
                    )}
                    {selectedReportType === 'summary' && (
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between p-2 bg-gray-50 rounded text-xs"><span>Account SID</span><span className="font-mono">{analytics?.account?.sid?.substring(0, 20)}...</span></div>
                        <div className="flex justify-between p-2 bg-gray-50 rounded text-xs"><span>Total Messages</span><span className="font-bold">{stats.messagesSent}</span></div>
                        <div className="flex justify-between p-2 bg-gray-50 rounded text-xs"><span>Total Calls</span><span className="font-bold">{stats.callsMade}</span></div>
                        <div className="flex justify-between p-2 bg-gray-50 rounded text-xs"><span>Inbound Messages</span><span className="font-bold">{stats.inboundMessages}</span></div>
                        <div className="flex justify-between p-2 bg-gray-50 rounded text-xs"><span>Outbound Messages</span><span className="font-bold">{stats.outboundMessages}</span></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Download Button */}
                <Button 
                  className="w-full gap-2" 
                  disabled={isGeneratingReport}
                  onClick={() => {
                    setIsGeneratingReport(true);
                    setTimeout(() => {
                      const generators: Record<string, () => string> = {
                        messages: generateMessagesCSV,
                        calls: generateCallsCSV,
                        usage: generateUsageCSV,
                        summary: generateSummaryCSV
                      };
                      const filenames: Record<string, string> = {
                        messages: 'messages-report.csv',
                        calls: 'calls-report.csv',
                        usage: 'usage-report.csv',
                        summary: `summary-report-${new Date().toISOString().split('T')[0]}.csv`
                      };
                      downloadCSV(generators[selectedReportType](), filenames[selectedReportType]);
                      setIsGeneratingReport(false);
                    }, 500);
                  }}
                >
                  {isGeneratingReport ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="h-4 w-4" /> Download {selectedReportType.charAt(0).toUpperCase() + selectedReportType.slice(1)} Report (CSV)</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Quick Downloads */}
            <Card className="bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Downloads</CardTitle>
                <CardDescription className="text-xs">Download reports instantly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => { downloadCSV(generateMessagesCSV(), 'messages-report.csv'); }}>
                  <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center"><MessageSquare className="h-4 w-4 text-blue-600" /></div>
                  <div className="text-left"><p className="text-sm font-medium">Messages</p><p className="text-[10px] text-muted-foreground">{analytics?.messages.thisMonth.length || 0} records</p></div>
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => { downloadCSV(generateCallsCSV(), 'calls-report.csv'); }}>
                  <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center"><Phone className="h-4 w-4 text-green-600" /></div>
                  <div className="text-left"><p className="text-sm font-medium">Voice Calls</p><p className="text-[10px] text-muted-foreground">{analytics?.calls.thisMonth.length || 0} records</p></div>
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => { downloadCSV(generateUsageCSV(), 'usage-report.csv'); }}>
                  <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center"><BarChart3 className="h-4 w-4 text-purple-600" /></div>
                  <div className="text-left"><p className="text-sm font-medium">Usage Stats</p><p className="text-[10px] text-muted-foreground">7 metrics</p></div>
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => { downloadCSV(generateSummaryCSV(), 'summary-report.csv'); }}>
                  <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center"><FileText className="h-4 w-4 text-orange-600" /></div>
                  <div className="text-left"><p className="text-sm font-medium">Full Summary</p><p className="text-[10px] text-muted-foreground">Complete export</p></div>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card className="bg-white">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Notifications</h3>
              <p className="text-muted-foreground mt-2">Manage your notification preferences.</p>
              <Button className="mt-4" onClick={() => setLocation('/settings')}>
                Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
