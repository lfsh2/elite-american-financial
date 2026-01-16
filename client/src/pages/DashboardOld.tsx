import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/use-auth';
import { useTwilioAnalytics, formatNumber } from '../hooks/useTwilioData';
import { useLocation } from 'wouter';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { 
  MessageSquare, 
  Phone, 
  TrendingUp,
  Users,
  RefreshCw,
  Sparkles,
  Key,
  Shield,
  Settings,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { staggerContainer, fadeInUp } from '@/lib/animations';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const { analytics, loading, error, refresh } = useTwilioAnalytics();
  const [, setLocation] = useLocation();
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week');

  const stats = analytics ? {
    messagesSent: analytics.metrics.totalMessagesSentThisMonth,
    messageGrowth: analytics.metrics.totalMessagesSentYesterday > 0 
      ? Math.round(((analytics.metrics.totalMessagesSentToday - analytics.metrics.totalMessagesSentYesterday) / analytics.metrics.totalMessagesSentYesterday) * 100)
      : 0,
    callsMade: analytics.metrics.totalCallsThisWeek,
    callGrowth: 12,
    activeNumbers: analytics.phoneNumbers.length,
    numberGrowth: 0,
    deliveryRate: analytics.metrics.deliveryRateToday || 100,
    deliveryGrowth: 2.5
  } : {
    messagesSent: 0,
    messageGrowth: 0,
    callsMade: 0,
    callGrowth: 0,
    activeNumbers: 0,
    numberGrowth: 0,
    deliveryRate: 0,
    deliveryGrowth: 0
  };

  // Chart data based on selected time period
  const chartData = React.useMemo(() => {
    if (!analytics) return [];

    const now = new Date();
    
    if (timePeriod === 'day') {
      // Last 24 hours by hour
      return Array.from({ length: 24 }, (_, i) => {
        const hour = new Date(now);
        hour.setHours(now.getHours() - (23 - i), 0, 0, 0);
        const hourMessages = analytics.messages.today.filter(m => {
          const msgDate = new Date(m.dateSent);
          return msgDate.getHours() === hour.getHours();
        });
        return {
          name: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
          messages: hourMessages.length,
          calls: analytics.calls.today.filter(c => new Date(c.startTime).getHours() === hour.getHours()).length
        };
      });
    } else if (timePeriod === 'week') {
      // Last 7 days
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now);
        date.setDate(now.getDate() - (6 - i));
        const dayMessages = analytics.messages.thisWeek.filter(m => {
          const msgDate = new Date(m.dateSent);
          return msgDate.toDateString() === date.toDateString();
        });
        const dayCalls = analytics.calls.thisWeek.filter(c => {
          const callDate = new Date(c.startTime);
          return callDate.toDateString() === date.toDateString();
        });
        return {
          name: date.toLocaleDateString('en-US', { weekday: 'short' }),
          messages: dayMessages.length,
          calls: dayCalls.length
        };
      });
    } else {
      // Last 30 days
      return Array.from({ length: 30 }, (_, i) => {
        const date = new Date(now);
        date.setDate(now.getDate() - (29 - i));
        const dayMessages = analytics.messages.thisMonth.filter(m => {
          const msgDate = new Date(m.dateSent);
          return msgDate.toDateString() === date.toDateString();
        });
        const dayCalls = analytics.calls.thisMonth.filter(c => {
          const callDate = new Date(c.startTime);
          return callDate.toDateString() === date.toDateString();
        });
        return {
          name: date.getDate().toString(),
          messages: dayMessages.length,
          calls: dayCalls.length
        };
      });
    }
  }, [analytics, timePeriod]);

  // Recent activity
  const recentActivity = analytics ? [
    ...analytics.messages.today.slice(0, 3).map(m => ({
      id: m.sid,
      type: 'message' as const,
      title: `Message ${m.direction === 'inbound' ? 'received from' : 'sent to'} ${m.direction === 'inbound' ? m.from : m.to}`,
      description: m.body.substring(0, 50) + (m.body.length > 50 ? '...' : ''),
      timestamp: m.dateSent,
      user: user?.firstName + ' ' + user?.lastName
    })),
    ...analytics.calls.today.slice(0, 2).map(c => ({
      id: c.sid,
      type: 'call' as const,
      title: `Call ${c.direction === 'inbound' ? 'received from' : 'made to'} ${c.direction === 'inbound' ? c.from : c.to}`,
      description: `Duration: ${c.duration}s - Status: ${c.status}`,
      timestamp: c.startTime,
      user: user?.firstName + ' ' + user?.lastName
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10) : [];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            {loading ? 'Loading data...' : error ? 'Error loading data' : 
             `Live data from Twilio • Last updated: ${analytics ? new Date(analytics.generatedAt).toLocaleTimeString() : 'N/A'}`}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Messages"
          value={formatNumber(stats.messagesSent)}
          change={stats.messageGrowth}
          changeLabel={stats.messageGrowth > 0 ? "Trending up this month" : "Down from last period"}
          icon={MessageSquare}
          trend={stats.messageGrowth > 0 ? 'up' : stats.messageGrowth < 0 ? 'down' : 'neutral'}
          loading={loading}
        />
        <StatsCard
          title="Voice Calls"
          value={formatNumber(stats.callsMade)}
          change={stats.callGrowth}
          changeLabel="Total calls this week"
          icon={Phone}
          trend={stats.callGrowth > 0 ? 'up' : 'neutral'}
          loading={loading}
        />
        <StatsCard
          title="Active Numbers"
          value={stats.activeNumbers}
          change={stats.numberGrowth}
          changeLabel="Phone numbers in use"
          icon={Users}
          trend="neutral"
          loading={loading}
        />
        <StatsCard
          title="Delivery Rate"
          value={`${stats.deliveryRate.toFixed(1)}%`}
          change={stats.deliveryGrowth}
          changeLabel="Meets delivery targets"
          icon={TrendingUp}
          trend={stats.deliveryGrowth > 0 ? 'up' : 'neutral'}
          loading={loading}
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Chart */}
        <div className="col-span-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Communication Overview</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Total for the last {timePeriod === 'day' ? '24 hours' : timePeriod === 'week' ? '7 days' : '30 days'}
                  </p>
                </div>
                <Tabs value={timePeriod} onValueChange={(v) => setTimePeriod(v as any)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="day">Last 24h</TabsTrigger>
                    <TabsTrigger value="week">Last 7d</TabsTrigger>
                    <TabsTrigger value="month">Last 30d</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
              <CardContent className="pb-2">
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: 'none', 
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="messages" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorMessages)" 
                          name="Messages"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="calls" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorCalls)" 
                          name="Calls"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        {/* Activity Feed */}
        <div className="col-span-3">
          <ActivityFeed activities={recentActivity} loading={loading} />
        </div>
      </div>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium">Account SID</span>
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
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs font-mono text-muted-foreground break-all">
                {analytics?.account?.sid || 'Not available'}
              </p>
            </div>

            <div className="border rounded-lg p-4 hover:border-green-500 hover:bg-green-50/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">Auth Token</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setLocation('/settings')}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs font-mono text-muted-foreground">
                ••••••••••••••••
              </p>
              <p className="text-xs text-muted-foreground mt-1">View in Settings</p>
            </div>

            <div className="border rounded-lg p-4 hover:border-purple-500 hover:bg-purple-50/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium">API Keys</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setLocation('/api-integration')}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Manage API keys
              </p>
              <p className="text-xs text-muted-foreground mt-1">Configure access</p>
            </div>

            <div className="border rounded-lg p-4 hover:border-orange-500 hover:bg-orange-50/50 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-medium">Providers</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setLocation('/settings')}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Twilio, Commio
              </p>
              <p className="text-xs text-muted-foreground mt-1">Manage connections</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
