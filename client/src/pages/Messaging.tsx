import React, { useState, useMemo } from 'react';
import { useTwilioAnalytics, formatPhoneNumber } from '../hooks/useTwilioData';
import { 
  MessageSquare, 
  Send, 
  Search, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  MoreHorizontal,
  ArrowUpDown
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Message {
  sid: string;
  from: string;
  to: string;
  body: string;
  status: string;
  dateSent: string;
  direction: string;
}

export default function Messaging() {
  const { analytics, loading, refresh } = useTwilioAnalytics();
  const [activeTab, setActiveTab] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<Message | null>(null);
  const [sortField, setSortField] = useState<'date' | 'from' | 'to'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const messages = analytics?.messages.thisMonth || [];
  const inboundMessages = messages.filter(m => m.direction === 'inbound');
  const outboundMessages = messages.filter(m => m.direction === 'outbound-api' || m.direction === 'outbound-call');
  
  const metrics = analytics?.metrics || {
    totalMessagesSentToday: 0,
    totalMessagesReceivedToday: 0,
    totalMessagesSentThisMonth: 0,
    deliveryRateToday: 0,
    failedToday: 0
  };

  const filteredMessages = useMemo(() => {
    let msgs = activeTab === 'inbox' ? inboundMessages : 
                activeTab === 'sent' ? outboundMessages : messages;
    
    if (searchQuery) {
      msgs = msgs.filter(m => 
        m.from.includes(searchQuery) || 
        m.to.includes(searchQuery) || 
        m.body.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return msgs.sort((a, b) => {
      const aVal = sortField === 'date' ? new Date(a.dateSent).getTime() :
                   sortField === 'from' ? a.from : a.to;
      const bVal = sortField === 'date' ? new Date(b.dateSent).getTime() :
                   sortField === 'from' ? b.from : b.to;
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [activeTab, inboundMessages, outboundMessages, messages, searchQuery, sortField, sortOrder]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case 'failed':
      case 'undelivered':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'sent':
      case 'queued':
      case 'sending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const toggleSort = (field: 'date' | 'from' | 'to') => {
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
            <p className="mt-4 text-muted-foreground">Loading messages...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Messaging</h2>
          <p className="text-muted-foreground">
            Send and receive messages through your Elite Financial numbers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Send className="mr-2 h-4 w-4" />
                New Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Send New Message</DialogTitle>
                <DialogDescription>
                  Send an SMS message to a phone number
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="from">From Number</Label>
                  <Input id="from" placeholder="+1 (555) 000-0000" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="to">To Number</Label>
                  <Input id="to" placeholder="+1 (555) 000-0000" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Type your message here..." rows={4} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">
                  <Send className="mr-2 h-4 w-4" />
                  Send Message
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalMessagesSentToday}</div>
            <p className="text-xs text-muted-foreground">Outbound messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received Today</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalMessagesReceivedToday}</div>
            <p className="text-xs text-muted-foreground">Inbound messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.deliveryRateToday.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Successfully delivered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Today</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.failedToday}</div>
            <p className="text-xs text-muted-foreground">Delivery failures</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Messages</CardTitle>
              <CardDescription>View and manage your SMS messages</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages..."
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
              <TabsTrigger value="inbox">Inbox ({inboundMessages.length})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({outboundMessages.length})</TabsTrigger>
              <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('date')}>
                        <div className="flex items-center">
                          Date
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No messages found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMessages.slice(0, 50).map((message) => (
                        <TableRow 
                          key={message.sid}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPreviewMessage(message)}
                        >
                          <TableCell className="font-medium">
                            {formatPhoneNumber(message.from)}
                          </TableCell>
                          <TableCell>{formatPhoneNumber(message.to)}</TableCell>
                          <TableCell className="max-w-md truncate">
                            {message.body}
                          </TableCell>
                          <TableCell>{getStatusBadge(message.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(message.dateSent).toLocaleString()}
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
                                <DropdownMenuItem onClick={() => setPreviewMessage(message)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>Reply</DropdownMenuItem>
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
              {filteredMessages.length > 50 && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Showing 50 of {filteredMessages.length} messages
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Message Preview Modal */}
      <Dialog open={!!previewMessage} onOpenChange={() => setPreviewMessage(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
            <DialogDescription>
              Complete information about this message
            </DialogDescription>
          </DialogHeader>
          {previewMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">From</Label>
                  <p className="text-sm font-medium mt-1">{formatPhoneNumber(previewMessage.from)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">To</Label>
                  <p className="text-sm font-medium mt-1">{formatPhoneNumber(previewMessage.to)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(previewMessage.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Direction</Label>
                  <p className="text-sm font-medium mt-1 capitalize">
                    {previewMessage.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Date & Time</Label>
                <p className="text-sm font-medium mt-1">
                  {new Date(previewMessage.dateSent).toLocaleString('en-US', {
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

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Message ID</Label>
                <p className="text-xs font-mono mt-1 text-muted-foreground">{previewMessage.sid}</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Message Content</Label>
                <div className="mt-2 p-4 bg-muted rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{previewMessage.body}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewMessage(null)}>
              Close
            </Button>
            <Button>
              Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
