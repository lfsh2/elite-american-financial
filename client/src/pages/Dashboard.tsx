import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/use-auth';
import { Link } from 'wouter';
import { useToast } from "@/components/ui/use-toast";
import { useTwilioAnalytics, formatNumber, formatCurrency } from '../hooks/useTwilioData';
import { 
  ArrowUp, 
  ArrowDown,
  MessageSquare, 
  Users, 
  BarChart3,
  BarChart4,
  Sparkles,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  Send,
  Phone,
  DollarSign,
  RefreshCw,
  TrendingUp
} from 'lucide-react';

interface AIInsight {
  title: string;
  description: string;
  type: 'success' | 'warning' | 'info' | 'tip';
  metric?: string;
  recommendation?: string;
}

type TimePeriod = 'day' | 'week' | 'month';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { analytics, loading: twilioLoading, error: twilioError, refresh } = useTwilioAnalytics();
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [question, setQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('week');

  // Real statistics from Twilio
  const stats = analytics ? {
    messagesSent: analytics.metrics.totalMessagesSentThisMonth,
    messageGrowth: analytics.metrics.totalMessagesSentYesterday > 0 
      ? Math.round(((analytics.metrics.totalMessagesSentToday - analytics.metrics.totalMessagesSentYesterday) / analytics.metrics.totalMessagesSentYesterday) * 100)
      : 0,
    activeUsers: analytics.phoneNumbers.length,
    userGrowth: 0,
    deliveryRate: analytics.metrics.deliveryRateToday || 100,
    deliveryGrowth: 0
  } : {
    messagesSent: 0,
    messageGrowth: 0,
    activeUsers: 0,
    userGrowth: 0,
    deliveryRate: 0,
    deliveryGrowth: 0
  };
  
  // Real messaging data from Twilio - grouped by selected time period
  const messagingData = useMemo(() => {
    if (!analytics) {
      return {
        outgoing: { ok: 0, errors: 0, data: [], labels: [] },
        incoming: { received: 0, failed: 0, optOut: 0, data: [], labels: [] }
      };
    }

    const now = new Date();
    let periods: { start: Date; end: Date; label: string }[] = [];
    let messages = analytics.messages.thisMonth;

    if (timePeriod === 'day') {
      // Last 24 hours, grouped by hour
      periods = Array.from({ length: 24 }, (_, i) => {
        const start = new Date(now);
        start.setHours(now.getHours() - (23 - i), 0, 0, 0);
        const end = new Date(start);
        end.setHours(start.getHours() + 1);
        return {
          start,
          end,
          label: start.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
        };
      });
      messages = analytics.messages.today;
    } else if (timePeriod === 'week') {
      // Last 7 days
      periods = Array.from({ length: 7 }, (_, i) => {
        const start = new Date(now);
        start.setDate(now.getDate() - (6 - i));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        return {
          start,
          end,
          label: start.toLocaleDateString('en-US', { weekday: 'short' })
        };
      });
      messages = analytics.messages.thisWeek;
    } else {
      // Last 30 days, grouped by week or by day
      periods = Array.from({ length: 30 }, (_, i) => {
        const start = new Date(now);
        start.setDate(now.getDate() - (29 - i));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        return {
          start,
          end,
          label: start.getDate().toString()
        };
      });
      messages = analytics.messages.thisMonth;
    }

    // Count outgoing messages per period
    const outgoingData = periods.map(period => {
      return messages.filter(m => {
        const msgDate = new Date(m.dateSent);
        return msgDate >= period.start && msgDate < period.end && 
          (m.direction === 'outbound-api' || m.direction === 'outbound-call' || m.direction === 'outbound-reply');
      }).length;
    });

    // Count incoming messages per period
    const incomingData = periods.map(period => {
      return messages.filter(m => {
        const msgDate = new Date(m.dateSent);
        return msgDate >= period.start && msgDate < period.end && m.direction === 'inbound';
      }).length;
    });

    const labels = periods.map(p => p.label);

    return {
      outgoing: {
        ok: analytics.metrics.deliveryRateToday,
        errors: 100 - analytics.metrics.deliveryRateToday,
        data: outgoingData,
        labels
      },
      incoming: {
        received: analytics.metrics.totalMessagesReceivedToday,
        failed: analytics.metrics.failedToday,
        optOut: 0,
        data: incomingData,
        labels
      }
    };
  }, [analytics, timePeriod]);

  // Real status data
  const statusData = [
    { id: 1, status: 'Delivered', value: `${stats.deliveryRate}%`, type: 'positive' },
    { id: 2, status: 'Failed', value: `${(100 - stats.deliveryRate).toFixed(1)}%`, type: 'negative' }
  ];

  const incomingData = [
    { id: 1, status: 'Received', value: analytics ? analytics.metrics.totalMessagesReceivedToday.toString() : '0', type: 'positive' },
    { id: 2, status: 'Failed', value: analytics ? analytics.metrics.failedToday.toString() : '0', type: 'negative' },
    { id: 3, status: 'This Month', value: analytics ? formatNumber(analytics.metrics.totalMessagesSentThisMonth) : '0', type: 'info' }
  ];

  // Fetch AI insights
  const fetchAIInsights = async () => {
    setIsLoadingInsights(true);
    setShowAIPanel(true);
    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: {
            messagesSent: stats.messagesSent,
            messagesReceived: 1423,
            deliveryRate: stats.deliveryRate,
            errorRate: 1.8,
            optOutRate: 0.3,
            activeUsers: stats.activeUsers,
            topHours: [10, 14, 16],
            weeklyTrend: messagingData.outgoing.data
          }
        })
      });
      const data = await response.json();
      setInsights(data.insights || []);
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch AI insights. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // Ask AI a question
  const askAI = async () => {
    if (!question.trim()) return;
    
    setIsAskingAI(true);
    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          stats: {
            messagesSent: stats.messagesSent,
            messagesReceived: 1423,
            deliveryRate: stats.deliveryRate,
            errorRate: 1.8,
            optOutRate: 0.3,
            activeUsers: stats.activeUsers,
            topHours: [10, 14, 16],
            weeklyTrend: messagingData.outgoing.data
          }
        })
      });
      const data = await response.json();
      setAiResponse(data.answer || 'No response received.');
    } catch (error) {
      console.error('Error asking AI:', error);
      setAiResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsAskingAI(false);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'tip':
        return <Lightbulb className="w-5 h-5 text-purple-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-500" />;
    }
  };

  const getInsightBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      case 'tip':
        return 'bg-purple-50 border-purple-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold mb-2">Welcome to SyncGrid</h1>
          <p className="text-gray-500">
            {twilioLoading ? 'Loading real-time data...' : 
             twilioError ? 'Error loading data' :
             `Live data from Twilio • Last updated: ${analytics ? new Date(analytics.generatedAt).toLocaleTimeString() : 'N/A'}`}
          </p>
        </div>
        <button 
          onClick={refresh}
          disabled={twilioLoading}
          className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${twilioLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading State */}
      {twilioLoading && (
        <div className="flex items-center justify-center py-8 mb-6 bg-blue-50 rounded-lg">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-3" />
          <span className="text-blue-600">Loading Twilio data...</span>
        </div>
      )}
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <StatCard 
          title="Messages This Month" 
          value={stats.messagesSent} 
          change={stats.messageGrowth}
          icon={<MessageSquare className="text-blue-500" size={24} />} 
        />
        
        <StatCard 
          title="Phone Numbers" 
          value={stats.activeUsers} 
          change={stats.userGrowth}
          icon={<Phone className="text-green-500" size={24} />} 
        />
        
        <StatCard 
          title="Delivery Rate" 
          value={`${stats.deliveryRate}%`} 
          change={stats.deliveryGrowth}
          icon={<BarChart3 className="text-blue-500" size={24} />} 
        />

        <StatCard 
          title="Spend This Month" 
          value={analytics ? `$${analytics.metrics.totalSpendThisMonth.toFixed(2)}` : '$0.00'} 
          change={0}
          icon={<DollarSign className="text-yellow-500" size={24} />} 
        />
      </div>
      
      {/* Messaging Insights */}
      <div className="mb-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Messaging Insights</h2>
          <div className="flex items-center gap-4">
            {/* Time Period Selector */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setTimePeriod('day')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timePeriod === 'day' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                24h
              </button>
              <button
                onClick={() => setTimePeriod('week')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timePeriod === 'week' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setTimePeriod('month')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timePeriod === 'month' 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                30 Days
              </button>
            </div>
            
            <button 
              onClick={fetchAIInsights}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-colors flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              <span>AI Insights</span>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outgoing Messages */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-medium">Outgoing Messages</h3>
              <div className="flex items-center text-sm text-gray-500">
                <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                {timePeriod === 'day' ? 'Last 24 hours' : timePeriod === 'week' ? 'Last 7 days' : 'Last 30 days'}
              </div>
            </div>
            
            <div className="p-4">
              {/* Line chart for outgoing messages */}
              <LineChart 
                data={messagingData.outgoing.data} 
                labels={messagingData.outgoing.labels}
                color="#22c55e" 
                label="Outgoing"
              />
              
              {/* Status cards */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="border border-gray-100 rounded-md p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2 bg-green-500"></div>
                    <span className="text-sm text-gray-600">Delivered</span>
                  </div>
                  <div className="text-2xl font-bold">{stats.deliveryRate.toFixed(1)}%</div>
                </div>
                <div className="border border-gray-100 rounded-md p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2 bg-red-500"></div>
                    <span className="text-sm text-gray-600">Failed</span>
                  </div>
                  <div className="text-2xl font-bold">{(100 - stats.deliveryRate).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Incoming Messages */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-medium">Incoming Messages</h3>
              <div className="flex items-center text-sm text-gray-500">
                <TrendingUp className="w-4 h-4 mr-1 text-blue-500" />
                {timePeriod === 'day' ? 'Last 24 hours' : timePeriod === 'week' ? 'Last 7 days' : 'Last 30 days'}
              </div>
            </div>
            
            <div className="p-4">
              {/* Line chart for incoming messages */}
              <LineChart 
                data={messagingData.incoming.data} 
                labels={messagingData.incoming.labels}
                color="#3b82f6" 
                label="Incoming"
              />
              
              {/* Status cards */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="border border-gray-100 rounded-md p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2 bg-green-500"></div>
                    <span className="text-sm text-gray-600">Received Today</span>
                  </div>
                  <div className="text-2xl font-bold">{analytics?.metrics.totalMessagesReceivedToday || 0}</div>
                </div>
                <div className="border border-gray-100 rounded-md p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2 bg-blue-500"></div>
                    <span className="text-sm text-gray-600">This Period</span>
                  </div>
                  <div className="text-2xl font-bold">{messagingData.incoming.data.reduce((a: number, b: number) => a + b, 0)}</div>
                </div>
                <div className="border border-gray-100 rounded-md p-4">
                  <div className="flex items-center mb-2">
                    <div className="w-3 h-3 rounded-full mr-2 bg-purple-500"></div>
                    <span className="text-sm text-gray-600">This Month</span>
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(stats.messagesSent)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights Panel */}
      {showAIPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center text-white">
                <Sparkles className="w-5 h-5 mr-2" />
                <h2 className="text-lg font-semibold">AI-Powered Insights</h2>
              </div>
              <button 
                onClick={() => setShowAIPanel(false)}
                className="text-white hover:bg-white/20 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-180px)]">
              {isLoadingInsights ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                  <p className="text-gray-500">Analyzing your messaging data...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {insights.map((insight, index) => (
                    <div 
                      key={index} 
                      className={`p-4 rounded-lg border ${getInsightBgColor(insight.type)}`}
                    >
                      <div className="flex items-start">
                        <div className="flex-shrink-0 mt-0.5">
                          {getInsightIcon(insight.type)}
                        </div>
                        <div className="ml-3 flex-1">
                          <h4 className="font-medium text-gray-900">{insight.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                          {insight.recommendation && (
                            <p className="text-sm text-gray-500 mt-2 italic">
                              💡 {insight.recommendation}
                            </p>
                          )}
                          {insight.metric && (
                            <span className="inline-block mt-2 text-xs bg-white/50 px-2 py-0.5 rounded">
                              {insight.metric}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ask AI Section */}
            <div className="p-4 border-t bg-gray-50">
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700">Ask AI about your messaging performance</label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., How can I improve my delivery rate?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && askAI()}
                />
                <button
                  onClick={askAI}
                  disabled={isAskingAI || !question.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                >
                  {isAskingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {aiResponse && (
                <div className="mt-3 p-3 bg-white rounded-md border border-gray-200">
                  <p className="text-sm text-gray-700">{aiResponse}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  change,
  icon
}: { 
  title: string;
  value: number | string;
  change: number;
  icon: React.ReactNode;
}) {
  const isPositive = change >= 0;
  
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-gray-500 font-normal mb-1">{title}</h3>
          <p className="text-4xl font-bold">{value}</p>
        </div>
        <div className="bg-blue-50 rounded-full p-3 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className={`flex items-center mt-4 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
        <span>{Math.abs(change)}% this week</span>
      </div>
    </div>
  );
}

/**
 * Line Chart Component - SVG-based line chart with area fill
 */
function LineChart({ 
  data, 
  labels,
  color, 
  label 
}: { 
  data: number[]; 
  labels: string[];
  color: string; 
  label: string;
}) {
  const width = 100;
  const height = 50;
  const padding = 2;
  
  // Handle empty data
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        No data available
      </div>
    );
  }
  
  // Calculate max value for scaling
  const maxValue = Math.max(...data, 1);
  
  // Generate points for the line
  const points = data.map((value, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    return { x, y, value };
  });
  
  // Create SVG path for line
  const linePath = points.map((point, i) => 
    `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');
  
  // Create SVG path for area fill
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;
  
  // Use provided labels or generate defaults
  const displayLabels = labels.length > 0 ? labels : data.map((_, i) => i.toString());
  
  // For large datasets, show fewer labels
  const labelStep = displayLabels.length > 10 ? Math.ceil(displayLabels.length / 7) : 1;
  const visibleLabels = displayLabels.filter((_, i) => i % labelStep === 0 || i === displayLabels.length - 1);

  return (
    <div className="h-48">
      {/* Chart header */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color }}></div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="text-sm text-gray-500">
          Total: <span className="font-semibold text-gray-900">{data.reduce((a, b) => a + b, 0)}</span>
        </div>
      </div>
      
      {/* SVG Chart */}
      <div className="relative h-32 ml-6">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((percent) => (
            <line
              key={percent}
              x1={padding}
              y1={height - padding - (percent / 100) * (height - padding * 2)}
              x2={width - padding}
              y2={height - padding - (percent / 100) * (height - padding * 2)}
              stroke="#e5e7eb"
              strokeWidth="0.3"
            />
          ))}
          
          {/* Area fill */}
          <path
            d={areaPath}
            fill={color}
            fillOpacity="0.15"
          />
          
          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points - only show for smaller datasets */}
          {data.length <= 14 && points.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r="1.2"
                fill="white"
                stroke={color}
                strokeWidth="0.8"
              />
              {/* Hover area for tooltip */}
              <circle
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill="transparent"
                className="cursor-pointer"
              >
                <title>{`${displayLabels[i]}: ${point.value}`}</title>
              </circle>
            </g>
          ))}
        </svg>
        
        {/* Y-axis labels */}
        <div className="absolute -left-6 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-400">
          <span>{maxValue}</span>
          <span>{Math.round(maxValue / 2)}</span>
          <span>0</span>
        </div>
      </div>
      
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-500 mt-1 ml-6">
        {visibleLabels.map((lbl, i) => (
          <span key={i} className="text-center">{lbl}</span>
        ))}
      </div>
    </div>
  );
}