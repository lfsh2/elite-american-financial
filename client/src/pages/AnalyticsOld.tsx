import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  MessageSquare, 
  Phone, 
  DollarSign,
  Download,
  Calendar,
  RefreshCw,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  FileJson,
  Clock,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { useAccount } from '../contexts/AccountContext';
import { useToast } from '../components/ui/use-toast';

// Types
interface UsageMetrics {
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

interface TrendDataPoint {
  date: string;
  label: string;
  messages: number;
  calls: number;
  cost: number | null;
}

interface AccountAnalytics {
  accountId: string;
  accountName: string;
  period: { startDate: string; endDate: string };
  metrics: UsageMetrics;
  trends: TrendDataPoint[];
  topPhoneNumbers: {
    phoneNumber: string;
    messageCount: number;
    callCount: number;
    cost: number | null;
  }[];
  subAccountBreakdown?: {
    accountId: string;
    accountName: string;
    metrics: UsageMetrics;
  }[];
}

type TimePeriod = '7d' | '30d' | '90d';

// Metric Card Component
function MetricCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color,
  subtitle
}: { 
  title: string; 
  value: string | number; 
  change?: number;
  icon: React.ElementType; 
  color: string;
  subtitle?: string;
}) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      {change !== undefined && (
        <div className="mt-4 flex items-center">
          {isPositive ? (
            <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
          ) : isNegative ? (
            <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
          ) : null}
          <span className={`text-sm font-medium ${
            isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
          }`}>
            {isPositive ? '+' : ''}{change?.toFixed(1)}%
          </span>
          <span className="text-sm text-gray-400 ml-1">vs last period</span>
        </div>
      )}
    </div>
  );
}

// Line Chart Component
function AnalyticsChart({ 
  data, 
  dataKey,
  color,
  title 
}: { 
  data: TrendDataPoint[];
  dataKey: 'messages' | 'calls' | 'cost';
  color: string;
  title: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        No data available
      </div>
    );
  }

  const values = data.map(d => d[dataKey] || 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values);
  
  const width = 100;
  const height = 60;
  const padding = 5;
  
  const points = data.map((d, i) => {
    const val = d[dataKey] || 0;
    const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - ((val - minValue) / (maxValue - minValue || 1)) * (height - 2 * padding);
    return { x, y, value: val, label: d.label };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1]?.x || 0} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="relative h-64">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1={padding}
              y1={padding + ratio * (height - 2 * padding)}
              x2={width - padding}
              y2={padding + ratio * (height - 2 * padding)}
              stroke="#f0f0f0"
              strokeWidth="0.5"
            />
          ))}
          
          {/* Area fill */}
          <path d={areaD} fill={`${color}20`} />
          
          {/* Line */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Data points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} />
          ))}
        </svg>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-xs text-gray-400">
          {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0).map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      </div>
      
      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-lg font-semibold text-gray-900">
            {dataKey === 'cost' ? `$${values.reduce((a, b) => a + b, 0).toFixed(2)}` : values.reduce((a, b) => a + b, 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Average</p>
          <p className="text-lg font-semibold text-gray-900">
            {dataKey === 'cost' ? `$${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}` : Math.round(values.reduce((a, b) => a + b, 0) / values.length).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Peak</p>
          <p className="text-lg font-semibold text-gray-900">
            {dataKey === 'cost' ? `$${maxValue.toFixed(2)}` : maxValue.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// Sub-Account Breakdown Component
function SubAccountBreakdown({ 
  breakdown 
}: { 
  breakdown: AccountAnalytics['subAccountBreakdown'] 
}) {
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  const totalCost = breakdown.reduce((sum, acc) => sum + (acc.metrics?.costs?.total || 0), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost by Sub-Account</h3>
      
      <div className="space-y-4">
        {breakdown.map((account, index) => {
          const accountCost = account.metrics?.costs?.total || 0;
          const percentage = totalCost > 0 ? (accountCost / totalCost) * 100 : 0;
          const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
          const color = colors[index % colors.length];
          
          return (
            <div key={account.accountId}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${color} mr-2`} />
                  <span className="text-sm font-medium text-gray-700">{account.accountName}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  ${accountCost.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>{account.metrics?.messages?.total || 0} messages</span>
                <span>{percentage.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Top Phone Numbers Component
function TopPhoneNumbers({ 
  phoneNumbers 
}: { 
  phoneNumbers: AccountAnalytics['topPhoneNumbers'] 
}) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Phone Numbers</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="pb-3">Phone Number</th>
              <th className="pb-3 text-right">Messages</th>
              <th className="pb-3 text-right">Calls</th>
              <th className="pb-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {phoneNumbers.slice(0, 5).map((pn, index) => (
              <tr key={index} className="text-sm">
                <td className="py-3 font-mono text-gray-900">{pn.phoneNumber}</td>
                <td className="py-3 text-right text-gray-600">{(pn.messageCount || 0).toLocaleString()}</td>
                <td className="py-3 text-right text-gray-600">{(pn.callCount || 0).toLocaleString()}</td>
                <td className="py-3 text-right font-medium text-gray-900">${(pn.cost || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Main Analytics Page
export default function Analytics() {
  const { currentAccount, isOverviewMode } = useAccount();
  const { toast } = useToast();
  
  const [analytics, setAnalytics] = useState<AccountAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [isExporting, setIsExporting] = useState(false);

  // Calculate date range based on time period
  const dateRange = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timePeriod) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }
    
    return { startDate, endDate };
  }, [timePeriod]);

  // Fetch analytics data
  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const accountId = currentAccount?.id || 'acc_master_twilio';
      const url = isOverviewMode 
        ? `/api/analytics/overview?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`
        : `/api/analytics/account/${accountId}?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch analytics');
      }
      
      // Handle overview response format
      if (isOverviewMode && data.accounts) {
        // Aggregate overview data into single analytics object
        setAnalytics({
          accountId: 'overview',
          accountName: 'All Accounts',
          period: data.period,
          metrics: data.summary,
          trends: data.accounts[0]?.trends || [],
          topPhoneNumbers: data.accounts.flatMap((a: AccountAnalytics) => a.topPhoneNumbers || []).slice(0, 10),
          subAccountBreakdown: data.accounts.map((a: AccountAnalytics) => ({
            accountId: a.accountId,
            accountName: a.accountName,
            metrics: a.metrics,
          })),
        });
      } else {
        setAnalytics(data);
      }
    } catch (err: any) {
      console.error('Error fetching analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentAccount, isOverviewMode, timePeriod]);

  // Export handlers
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/analytics/export/csv?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`
      );
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elite-financial-analytics-${timePeriod}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({ title: 'Export successful', description: 'CSV file downloaded' });
    } catch (err) {
      toast({ title: 'Export failed', description: 'Could not export CSV', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/analytics/export/json?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`
      );
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elite-financial-analytics-${timePeriod}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({ title: 'Export successful', description: 'JSON file downloaded' });
    } catch (err) {
      toast({ title: 'Export failed', description: 'Could not export JSON', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <XCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">
            {isOverviewMode ? 'Overview of all accounts' : analytics?.accountName || 'Account analytics'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Time Period Selector */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['7d', '30d', '90d'] as TimePeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setTimePeriod(period)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timePeriod === period
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {period === '7d' ? '7 Days' : period === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={fetchAnalytics}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          {/* Export Dropdown */}
          <div className="relative group">
            <button
              disabled={isExporting}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={handleExportCSV}
                className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export as CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FileJson className="w-4 h-4 mr-2" />
                Export as JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Messages"
          value={analytics?.metrics.messages.total.toLocaleString() || '0'}
          icon={MessageSquare}
          color="bg-blue-500"
          subtitle={`${analytics?.metrics.messages.sent || 0} sent, ${analytics?.metrics.messages.received || 0} received`}
        />
        <MetricCard
          title="Total Calls"
          value={((analytics?.metrics.calls.outbound || 0) + (analytics?.metrics.calls.inbound || 0)).toLocaleString()}
          icon={Phone}
          color="bg-green-500"
          subtitle={`${formatDuration(analytics?.metrics.calls.totalDuration || 0)} total duration`}
        />
        <MetricCard
          title="Total Cost"
          value={`$${(analytics?.metrics.costs.total || 0).toFixed(2)}`}
          icon={DollarSign}
          color="bg-purple-500"
          subtitle={`$${(analytics?.metrics.costs.messaging || 0).toFixed(2)} messaging, $${(analytics?.metrics.costs.voice || 0).toFixed(2)} voice`}
        />
        <MetricCard
          title="Delivery Rate"
          value={analytics?.metrics.messages.total 
            ? `${(((analytics.metrics.messages.total - analytics.metrics.messages.failed) / analytics.metrics.messages.total) * 100).toFixed(1)}%`
            : '100%'}
          icon={CheckCircle}
          color="bg-emerald-500"
          subtitle={`${analytics?.metrics.messages.failed || 0} failed messages`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalyticsChart
          data={analytics?.trends || []}
          dataKey="messages"
          color="#3b82f6"
          title="Message Volume"
        />
        <AnalyticsChart
          data={analytics?.trends || []}
          dataKey="cost"
          color="#8b5cf6"
          title="Daily Cost"
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopPhoneNumbers phoneNumbers={analytics?.topPhoneNumbers || []} />
        <SubAccountBreakdown breakdown={analytics?.subAccountBreakdown} />
      </div>

      {/* Period Info */}
      <div className="text-center text-sm text-gray-400">
        <Calendar className="w-4 h-4 inline-block mr-1" />
        Data from {dateRange.startDate.toLocaleDateString()} to {dateRange.endDate.toLocaleDateString()}
      </div>
    </div>
  );
}
