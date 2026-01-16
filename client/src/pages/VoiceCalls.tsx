import React, { useState, useMemo } from 'react';
import { useTwilioAnalytics, formatPhoneNumber, formatDuration } from '../hooks/useTwilioData';
import { 
  Phone, 
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Search,
  RefreshCw,
  Filter,
  MoreHorizontal,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Call {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  duration: string;
  startTime: string;
}

export default function VoiceCalls() {
  const { analytics, loading, refresh } = useTwilioAnalytics();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewCall, setPreviewCall] = useState<Call | null>(null);
  const [sortField, setSortField] = useState<'date' | 'from' | 'to' | 'duration'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const callHistory = analytics?.calls.thisMonth || [];
  const inboundCalls = callHistory.filter(c => c.direction === 'inbound');
  const outboundCalls = callHistory.filter(c => c.direction === 'outbound-api' || c.direction === 'outbound-dial');

  const stats = analytics ? {
    totalCalls: analytics.metrics.totalCallsThisWeek,
    inbound: inboundCalls.length,
    outbound: outboundCalls.length,
    avgDuration: formatDuration(Math.round(analytics.metrics.totalCallDurationToday / Math.max(analytics.metrics.totalCallsToday, 1))),
    missedCalls: callHistory.filter(c => c.status === 'no-answer' || c.status === 'busy').length
  } : {
    totalCalls: 0,
    inbound: 0,
    outbound: 0,
    avgDuration: '0m 0s',
    missedCalls: 0
  };

  const filteredCalls = useMemo(() => {
    let calls = activeTab === 'inbound' ? inboundCalls : 
                 activeTab === 'outbound' ? outboundCalls : callHistory;
    
    if (searchQuery) {
      calls = calls.filter(c => 
        c.from.includes(searchQuery) || 
        c.to.includes(searchQuery)
      );
    }

    return calls.sort((a, b) => {
      const aVal = sortField === 'date' ? new Date(a.startTime).getTime() :
                   sortField === 'from' ? a.from :
                   sortField === 'to' ? a.to :
                   parseInt(a.duration || '0');
      const bVal = sortField === 'date' ? new Date(b.startTime).getTime() :
                   sortField === 'from' ? b.from :
                   sortField === 'to' ? b.to :
                   parseInt(b.duration || '0');
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [activeTab, inboundCalls, outboundCalls, callHistory, searchQuery, sortField, sortOrder]);

  const getStatusBadge = (status: string, direction: string) => {
    if (status === 'completed') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    } else if (status === 'no-answer' || status === 'busy') {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <PhoneMissed className="w-3 h-3 mr-1" />
          Missed
        </Badge>
      );
    } else if (status === 'failed') {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          <AlertCircle className="w-3 h-3 mr-1" />
          {status}
        </Badge>
      );
    }
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === 'inbound') {
      return <PhoneIncoming className="w-4 h-4 text-green-600" />;
    } else {
      return <PhoneOutgoing className="w-4 h-4 text-blue-600" />;
    }
  };

  const formatCallDuration = (duration: string) => {
    const secs = parseInt(duration || '0');
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  const toggleSort = (field: 'date' | 'from' | 'to' | 'duration') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading call history...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Voice Calls</h2>
          <p className="text-muted-foreground">
            Manage phone calls and voice services
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm">
            <PhoneCall className="mr-2 h-4 w-4" />
            New Call
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inbound</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inbound}</div>
            <p className="text-xs text-muted-foreground">Received calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outbound</CardTitle>
            <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.outbound}</div>
            <p className="text-xs text-muted-foreground">Made calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgDuration}</div>
            <p className="text-xs text-muted-foreground">Per call</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missed Calls</CardTitle>
            <PhoneMissed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.missedCalls}</div>
            <p className="text-xs text-muted-foreground">No answer</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Call History</CardTitle>
              <CardDescription>View and manage your voice calls</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search calls..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All ({callHistory.length})</TabsTrigger>
              <TabsTrigger value="inbound">Inbound ({inboundCalls.length})</TabsTrigger>
              <TabsTrigger value="outbound">Outbound ({outboundCalls.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Type</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('from')}>
                        <div className="flex items-center">
                          From
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('to')}>
                        <div className="flex items-center">
                          To
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('duration')}>
                        <div className="flex items-center">
                          Duration
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('date')}>
                        <div className="flex items-center">
                          Date & Time
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCalls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No calls found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCalls.slice(0, 50).map((call) => (
                        <TableRow 
                          key={call.sid}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPreviewCall(call)}
                        >
                          <TableCell>
                            {getDirectionIcon(call.direction)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatPhoneNumber(call.from)}
                          </TableCell>
                          <TableCell>{formatPhoneNumber(call.to)}</TableCell>
                          <TableCell>{getStatusBadge(call.status, call.direction)}</TableCell>
                          <TableCell>{formatCallDuration(call.duration)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(call.startTime).toLocaleString()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setPreviewCall(call)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>Call Back</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {filteredCalls.length > 50 && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Showing 50 of {filteredCalls.length} calls
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Call Details Modal */}
      <Dialog open={!!previewCall} onOpenChange={() => setPreviewCall(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription>
              Complete information about this call
            </DialogDescription>
          </DialogHeader>
          {previewCall && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">From</Label>
                  <p className="text-sm font-medium mt-1">{formatPhoneNumber(previewCall.from)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">To</Label>
                  <p className="text-sm font-medium mt-1">{formatPhoneNumber(previewCall.to)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(previewCall.status, previewCall.direction)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Direction</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {getDirectionIcon(previewCall.direction)}
                    <span className="text-sm font-medium capitalize">
                      {previewCall.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Duration</Label>
                  <p className="text-sm font-medium mt-1">{formatCallDuration(previewCall.duration)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Date & Time</Label>
                  <p className="text-sm font-medium mt-1">
                    {new Date(previewCall.startTime).toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Call SID</Label>
                <p className="text-xs font-mono mt-1 text-muted-foreground">{previewCall.sid}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewCall(null)}>
              Close
            </Button>
            <Button>
              Call Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
