/**
 * Activity Logs Page
 * 
 * Production-ready implementation for viewing real-time activity logs.
 * Aggregates data from SMS messages, voice calls, emails, and system events.
 * 
 * Features:
 * - Real-time log streaming with auto-refresh
 * - Filter by log type (SMS, Voice, Email, API, System)
 * - Search functionality
 * - Date range filtering
 * - Export logs
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/utils";
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Activity,
  Search,
  Filter,
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  AlertTriangle,
  Info,
  ChevronDown,
  Calendar,
  Zap,
  Globe,
  User,
  Settings,
  Key
} from 'lucide-react';

// Log entry type
interface LogEntry {
  id: string;
  type: 'sms' | 'voice' | 'email' | 'api' | 'system';
  action: string;
  status: 'success' | 'failed' | 'pending' | 'info';
  direction?: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  message?: string;
  duration?: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Type icons and colors
const typeConfig = {
  sms: { icon: MessageSquare, color: 'blue', label: 'SMS' },
  voice: { icon: Phone, color: 'green', label: 'Voice' },
  email: { icon: Mail, color: 'purple', label: 'Email' },
  api: { icon: Globe, color: 'orange', label: 'API' },
  system: { icon: Settings, color: 'gray', label: 'System' }
};

const statusConfig = {
  success: { icon: CheckCircle, color: 'green', label: 'Success' },
  failed: { icon: XCircle, color: 'red', label: 'Failed' },
  pending: { icon: Clock, color: 'yellow', label: 'Pending' },
  info: { icon: Info, color: 'blue', label: 'Info' }
};

export default function Logs() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id || 1;
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all'>('today');
  
  // Expanded log details
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  /**
   * Fetch all activity data and transform to logs
   */
  const fetchLogs = useCallback(async () => {
    try {
      // Fetch SMS messages, voice calls, and emails in parallel
      const [smsRes, voiceRes, emailRes] = await Promise.all([
        fetch(`/api/sms/messages/${userId}?limit=100`),
        fetch(`/api/voice/calls/${userId}?limit=100`),
        fetch(`/api/email/messages/${userId}?limit=100`)
      ]);

      const allLogs: LogEntry[] = [];

      // Process SMS messages
      if (smsRes.ok) {
        const smsData = await smsRes.json();
        const smsLogs: LogEntry[] = (smsData || []).map((msg: any) => ({
          id: `sms-${msg.id}`,
          type: 'sms' as const,
          action: msg.direction === 'outbound' ? 'Message Sent' : 'Message Received',
          status: msg.status === 'delivered' || msg.status === 'sent' ? 'success' : 
                  msg.status === 'failed' ? 'failed' : 'pending',
          direction: msg.direction,
          from: msg.from,
          to: msg.to,
          message: msg.body,
          timestamp: msg.sentAt,
          metadata: {
            messageSid: msg.messageSid,
            campaignId: msg.campaignId
          }
        }));
        allLogs.push(...smsLogs);
      }

      // Process voice calls
      if (voiceRes.ok) {
        const voiceData = await voiceRes.json();
        const voiceLogs: LogEntry[] = (voiceData || []).map((call: any) => ({
          id: `voice-${call.id}`,
          type: 'voice' as const,
          action: call.direction === 'outbound' ? 'Outbound Call' : 'Inbound Call',
          status: call.status === 'completed' ? 'success' : 
                  call.status === 'failed' || call.status === 'no-answer' ? 'failed' : 'pending',
          direction: call.direction,
          from: call.from,
          to: call.to,
          duration: call.duration,
          timestamp: call.startTime,
          metadata: {
            callSid: call.callSid,
            endTime: call.endTime,
            recordingUrl: call.recordingUrl
          }
        }));
        allLogs.push(...voiceLogs);
      }

      // Process emails
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        const emailLogs: LogEntry[] = (emailData || []).map((email: any) => ({
          id: `email-${email.id}`,
          type: 'email' as const,
          action: 'Email Sent',
          status: email.status === 'delivered' || email.status === 'sent' ? 'success' : 
                  email.status === 'failed' ? 'failed' : 'pending',
          direction: 'outbound' as const,
          from: email.from,
          to: email.to,
          message: email.subject,
          timestamp: email.sentAt,
          metadata: {
            messageId: email.messageId,
            campaignId: email.campaignId
          }
        }));
        allLogs.push(...emailLogs);
      }

      // Sort by timestamp descending
      allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      setLogs(allLogs);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * Apply filters to logs
   */
  useEffect(() => {
    let filtered = [...logs];

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(log => log.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(log => log.status === statusFilter);
    }

    // Date range filter
    const now = new Date();
    if (dateRange === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(log => new Date(log.timestamp) >= startOfDay);
    } else if (dateRange === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.timestamp) >= sevenDaysAgo);
    } else if (dateRange === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.timestamp) >= thirtyDaysAgo);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(log => 
        log.action.toLowerCase().includes(query) ||
        log.from?.toLowerCase().includes(query) ||
        log.to?.toLowerCase().includes(query) ||
        log.message?.toLowerCase().includes(query)
      );
    }

    setFilteredLogs(filtered);
  }, [logs, typeFilter, statusFilter, dateRange, searchQuery]);

  /**
   * Initial load and auto-refresh
   */
  useEffect(() => {
    fetchLogs();

    // Set up auto-refresh
    if (isAutoRefresh) {
      refreshIntervalRef.current = setInterval(fetchLogs, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchLogs, isAutoRefresh]);

  /**
   * Manual refresh
   */
  const handleRefresh = () => {
    setIsLoading(true);
    fetchLogs();
  };

  /**
   * Export logs as CSV
   */
  const handleExport = () => {
    const headers = ['Timestamp', 'Type', 'Action', 'Status', 'From', 'To', 'Message'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toISOString(),
        log.type,
        log.action,
        log.status,
        log.from || '',
        log.to || '',
        `"${(log.message || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Complete',
      description: `Exported ${filteredLogs.length} log entries`
    });
  };

  /**
   * Get type badge
   */
  const getTypeBadge = (type: LogEntry['type']) => {
    const config = typeConfig[type];
    const Icon = config.icon;
    const colorClasses = {
      blue: 'bg-blue-100 text-blue-700',
      green: 'bg-green-100 text-green-700',
      purple: 'bg-purple-100 text-purple-700',
      orange: 'bg-orange-100 text-orange-700',
      gray: 'bg-gray-100 text-gray-700'
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClasses[config.color as keyof typeof colorClasses]}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  /**
   * Get status badge
   */
  const getStatusBadge = (status: LogEntry['status']) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    const colorClasses = {
      green: 'text-green-600',
      red: 'text-red-600',
      yellow: 'text-yellow-600',
      blue: 'text-blue-600'
    };
    
    return (
      <span className={`inline-flex items-center ${colorClasses[config.color as keyof typeof colorClasses]}`}>
        <Icon className="w-4 h-4" />
      </span>
    );
  };

  /**
   * Format duration
   */
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Stats
  const stats = {
    total: filteredLogs.length,
    success: filteredLogs.filter(l => l.status === 'success').length,
    failed: filteredLogs.filter(l => l.status === 'failed').length,
    sms: filteredLogs.filter(l => l.type === 'sms').length,
    voice: filteredLogs.filter(l => l.type === 'voice').length,
    email: filteredLogs.filter(l => l.type === 'email').length
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Activity Logs</h1>
          <p className="text-gray-500">
            Real-time view of all communication activity
            {lastRefresh && (
              <span className="text-xs ml-2">
                Last updated: {formatDateTime(lastRefresh.toISOString())}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center text-sm text-gray-600">
            <input
              type="checkbox"
              className="w-4 h-4 mr-2 text-blue-600 border-gray-300 rounded"
              checked={isAutoRefresh}
              onChange={(e) => setIsAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Success</p>
          <p className="text-2xl font-bold text-green-600">{stats.success}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">SMS</p>
          <p className="text-2xl font-bold text-blue-600">{stats.sms}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Voice</p>
          <p className="text-2xl font-bold text-green-600">{stats.voice}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Email</p>
          <p className="text-2xl font-bold text-purple-600">{stats.email}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Type Filter */}
          <select
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="sms">SMS</option>
            <option value="voice">Voice</option>
            <option value="email">Email</option>
          </select>
          
          {/* Status Filter */}
          <select
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          
          {/* Date Range */}
          <select
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading activity logs...</span>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From / To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(log.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getTypeBadge(log.type)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          {log.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-4 h-4 mr-2 text-green-500" />
                          ) : log.direction === 'outbound' ? (
                            <ArrowUpRight className="w-4 h-4 mr-2 text-blue-500" />
                          ) : null}
                          <span className="text-sm font-medium text-gray-900">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm">
                          {log.from && (
                            <div className="text-gray-900">
                              <span className="text-gray-500">From:</span> {log.from}
                            </div>
                          )}
                          {log.to && (
                            <div className="text-gray-600">
                              <span className="text-gray-500">To:</span> {log.to}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-600 max-w-xs truncate">
                          {log.type === 'voice' && log.duration !== undefined ? (
                            <span>Duration: {formatDuration(log.duration)}</span>
                          ) : log.message ? (
                            log.message
                          ) : (
                            '-'
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(log.timestamp)}
                      </td>
                    </tr>
                    {/* Expanded details */}
                    {expandedLog === log.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Log ID:</span>
                              <p className="font-mono text-xs">{log.id}</p>
                            </div>
                            {log.metadata?.messageSid && (
                              <div>
                                <span className="text-gray-500">Message SID:</span>
                                <p className="font-mono text-xs">{log.metadata.messageSid}</p>
                              </div>
                            )}
                            {log.metadata?.callSid && (
                              <div>
                                <span className="text-gray-500">Call SID:</span>
                                <p className="font-mono text-xs">{log.metadata.callSid}</p>
                              </div>
                            )}
                            {log.metadata?.campaignId && (
                              <div>
                                <span className="text-gray-500">Campaign ID:</span>
                                <p className="font-mono text-xs">{log.metadata.campaignId}</p>
                              </div>
                            )}
                            {log.message && log.type !== 'voice' && (
                              <div className="col-span-2 md:col-span-4">
                                <span className="text-gray-500">Full Message:</span>
                                <p className="mt-1 p-2 bg-white rounded border text-gray-700">{log.message}</p>
                              </div>
                            )}
                            {log.metadata?.recordingUrl && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Recording:</span>
                                <a 
                                  href={log.metadata.recordingUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline ml-2"
                                >
                                  Listen to recording
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Activity Logs</h3>
            <p className="text-gray-500">
              {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'No logs match your current filters. Try adjusting your search criteria.'
                : 'Activity logs will appear here as you send messages, make calls, and use the platform.'}
            </p>
          </div>
        )}
      </div>

      {/* Live indicator */}
      {isAutoRefresh && (
        <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center">
          <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
          Live
        </div>
      )}
    </div>
  );
}
