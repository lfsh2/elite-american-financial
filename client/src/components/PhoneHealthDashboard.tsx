/**
 * Phone Number Health Dashboard Component
 * 
 * Displays comprehensive health monitoring for phone numbers across providers.
 * Features:
 * - Health score visualization
 * - Status indicators (healthy, warning, critical)
 * - Provider-specific metrics
 * - Detailed health breakdown per number
 */

import React, { useState, useMemo } from 'react';
import {
  Phone,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  MessageSquare,
  PhoneCall,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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

export type DateRangeOption = 'today' | '7days' | '30days' | '90days';

interface PhoneHealthDashboardProps {
  data: HealthCheckSummary | null;
  loading: boolean;
  onRefresh: () => void;
  dateRange?: DateRangeOption;
  onDateRangeChange?: (range: DateRangeOption) => void;
}

export function PhoneHealthDashboard({ 
  data, 
  loading, 
  onRefresh,
  dateRange = 'today',
  onDateRangeChange,
}: PhoneHealthDashboardProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'activity'>('score');

  const toggleRow = (phoneNumber: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(phoneNumber)) {
      newExpanded.delete(phoneNumber);
    } else {
      newExpanded.add(phoneNumber);
    }
    setExpandedRows(newExpanded);
  };

  const filteredAndSortedNumbers = useMemo(() => {
    if (!data) return [];

    let filtered = data.phoneNumbers;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(pn => pn.status === filterStatus);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return a.healthScore - b.healthScore;
        case 'name':
          return a.phoneNumber.localeCompare(b.phoneNumber);
        case 'activity':
          const aTime = a.metrics.lastActivity ? new Date(a.metrics.lastActivity).getTime() : 0;
          const bTime = b.metrics.lastActivity ? new Date(b.metrics.lastActivity).getTime() : 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });
  }, [data, filterStatus, sortBy]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'healthy':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          label: 'Healthy',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
          label: 'Warning',
        };
      case 'critical':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
          label: 'Critical',
        };
      default:
        return {
          icon: Info,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          label: 'Unknown',
        };
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthScoreGradient = (score: number) => {
    if (score >= 80) return 'from-green-500 to-green-600';
    if (score >= 50) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith('+1') && number.length === 12) {
      return `(${number.substring(2, 5)}) ${number.substring(5, 8)}-${number.substring(8)}`;
    }
    return number;
  };

  const formatLastActivity = (date: Date | null) => {
    if (!date) return 'No activity';
    
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Less than 1 hour ago';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return activityDate.toLocaleDateString();
  };

  const getDateRangeLabel = (range: DateRangeOption) => {
    switch (range) {
      case 'today': return 'Today';
      case '7days': return 'Last 7 Days';
      case '30days': return 'Last 30 Days';
      case '90days': return 'Last 90 Days';
      default: return 'Today';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Checking phone number health...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Phone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No phone number data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalNumbers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.byProvider.twilio} Twilio, {data.byProvider.commio} Commio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", getHealthScoreColor(data.averageHealthScore))}>
              {data.averageHealthScore}
            </div>
            <Progress value={data.averageHealthScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.byStatus.healthy}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.totalNumbers > 0 ? Math.round((data.byStatus.healthy / data.totalNumbers) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {data.byStatus.warning + data.byStatus.critical}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.byStatus.warning} warning, {data.byStatus.critical} critical
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Phone Number Health Details</CardTitle>
              <CardDescription>Comprehensive health monitoring for all phone numbers</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onDateRangeChange && (
                <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRangeOption)}>
                  <SelectTrigger className="w-[160px] h-9">
                    <Calendar className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="7days">Last 7 Days</SelectItem>
                    <SelectItem value="30days">Last 30 Days</SelectItem>
                    <SelectItem value="90days">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-1">
                {['all', 'healthy', 'warning', 'critical'].map((status) => (
                  <Button
                    key={status}
                    variant={filterStatus === status ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterStatus(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Health Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery Rate</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Capabilities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedNumbers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No phone numbers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedNumbers.map((phone) => {
                    const statusConfig = getStatusConfig(phone.status);
                    const StatusIcon = statusConfig.icon;
                    const isExpanded = expandedRows.has(phone.phoneNumber);

                    return (
                      <React.Fragment key={phone.phoneNumber}>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell onClick={() => toggleRow(phone.phoneNumber)}>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono font-medium">
                            {formatPhoneNumber(phone.phoneNumber)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                phone.provider === 'twilio'
                                  ? 'border-red-300 text-red-600 bg-red-50'
                                  : 'border-blue-300 text-blue-600 bg-blue-50'
                              }
                            >
                              {phone.provider.charAt(0).toUpperCase() + phone.provider.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn("text-lg font-bold", getHealthScoreColor(phone.healthScore))}>
                                {phone.healthScore}
                              </div>
                              <Progress value={phone.healthScore} className="w-16" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(statusConfig.bgColor, statusConfig.color, 'border', statusConfig.borderColor)}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {phone.metrics.deliveryRate !== null ? (
                              <span className={phone.metrics.deliveryRate >= 95 ? 'text-green-600' : 'text-yellow-600'}>
                                {phone.metrics.deliveryRate.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatLastActivity(phone.metrics.lastActivity)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {phone.metrics.capabilities.voice && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <PhoneCall className="w-4 h-4 text-green-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>Voice enabled</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {phone.metrics.capabilities.sms && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <MessageSquare className="w-4 h-4 text-blue-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>SMS enabled</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {phone.metrics.capabilities.mms && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <ImageIcon className="w-4 h-4 text-purple-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>MMS enabled</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30">
                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">API Status</p>
                                    <Badge variant={phone.metrics.apiStatus === 'active' ? 'default' : 'destructive'}>
                                      {phone.metrics.apiStatus}
                                    </Badge>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Error Count (7d)</p>
                                    <p className="text-sm font-semibold">{phone.metrics.errorCount}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Account</p>
                                    <p className="text-sm font-semibold">{phone.accountName}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Last Checked</p>
                                    <p className="text-sm font-semibold">
                                      {new Date(phone.lastChecked).toLocaleTimeString()}
                                    </p>
                                  </div>
                                </div>
                                {phone.issues.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Issues Detected</p>
                                    <div className="space-y-1">
                                      {phone.issues.map((issue, idx) => (
                                        <div key={idx} className="flex items-start gap-2 text-sm">
                                          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                          <span>{issue}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
