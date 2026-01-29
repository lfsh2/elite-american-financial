import React, { useState, useMemo } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccountPhoneNumbers } from '../hooks/useTwilioData';
import { useAccount } from '../contexts/AccountContext';
import { 
  Phone, 
  Plus, 
  Search, 
  RefreshCw,
  Filter,
  MoreHorizontal,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  MessageSquare,
  PhoneCall,
  Image as ImageIcon,
  Globe,
  ShoppingCart,
  Loader2
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '../components/ui/use-toast';

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  status: string;
  dateCreated: string;
}

interface AvailableNumber {
  number: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  region: string;
  monthlyPrice: number;
}

export default function PhoneNumbers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentAccount, isOverviewMode } = useAccount();
  const { phoneNumbers: rawPhoneNumbers, loading, refresh } = useAccountPhoneNumbers();
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuyNumberModal, setShowBuyNumberModal] = useState(false);
  const [previewNumber, setPreviewNumber] = useState<PhoneNumber | null>(null);
  const [sortField, setSortField] = useState<'number' | 'name' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Buy Number Modal State
  const [numberSearchResults, setNumberSearchResults] = useState<AvailableNumber[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchArea, setSearchArea] = useState('');
  const [numberType, setNumberType] = useState('local');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(['voice', 'sms']);
  
  // Usage data state
  const [usageData, setUsageData] = useState<any>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const phoneNumbers = rawPhoneNumbers.map((pn: any, index) => ({
    id: pn.id || index.toString(),
    phoneNumber: pn.phoneNumber,
    friendlyName: pn.friendlyName || pn.phoneNumber,
    capabilities: pn.capabilities || { voice: false, sms: false, mms: false },
    status: pn.status || 'active',
    dateCreated: pn.dateCreated || new Date().toISOString(),
    provider: pn._provider || pn.provider || 'unknown',
    accountName: pn._accountName || pn.accountName || '',
  }));

  // Provider counts for summary badges
  const providerCounts = useMemo(() => {
    return phoneNumbers.reduce((acc: Record<string, number>, pn) => {
      const provider = pn.provider || 'unknown';
      acc[provider] = (acc[provider] || 0) + 1;
      return acc;
    }, {});
  }, [phoneNumbers]);

  const stats = {
    totalNumbers: phoneNumbers.length,
    voiceEnabled: phoneNumbers.filter(p => p.capabilities.voice).length,
    smsEnabled: phoneNumbers.filter(p => p.capabilities.sms).length,
    mmsEnabled: phoneNumbers.filter(p => p.capabilities.mms).length,
  };

  const filteredNumbers = useMemo(() => {
    let numbers = phoneNumbers.filter(pn => 
      pn.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pn.friendlyName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return numbers.sort((a, b) => {
      const aVal = sortField === 'number' ? a.phoneNumber :
                   sortField === 'name' ? a.friendlyName :
                   new Date(a.dateCreated).getTime();
      const bVal = sortField === 'number' ? b.phoneNumber :
                   sortField === 'name' ? b.friendlyName :
                   new Date(b.dateCreated).getTime();
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [phoneNumbers, searchQuery, sortField, sortOrder]);

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith('+1') && number.length === 12) {
      return `(${number.substring(2, 5)}) ${number.substring(5, 8)}-${number.substring(8)}`;
    }
    return number;
  };

  // Fetch usage data when Usage tab is selected
  React.useEffect(() => {
    if (activeTab === 'usage' && currentAccount?.id) {
      fetchUsageData();
    }
  }, [activeTab, currentAccount?.id]);

  const fetchUsageData = async () => {
    if (!currentAccount?.id) return;
    
    setLoadingUsage(true);
    try {
      const res = await fetch(`/api/accounts/${currentAccount.id}/phone-numbers/usage`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setUsageData(data);
      } else {
        console.error('Failed to fetch usage data');
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoadingUsage(false);
    }
  };

  // Get usage for a specific phone number
  const getUsageForNumber = (phoneNumber: string) => {
    if (!usageData?.byNumber) return null;
    return usageData.byNumber.find((u: any) => u.phoneNumber === phoneNumber);
  };

  const toggleSort = (field: 'number' | 'name' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const searchForNumbers = () => {
    setIsSearching(true);
    
    setTimeout(() => {
      const results = Array.from({ length: 10 }, (_, i) => {
        const areaCode = searchArea || '855';
        const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
        const number = `+1${areaCode}${randomSuffix}`;
        
        return {
          number,
          capabilities: {
            voice: selectedCapabilities.includes('voice'),
            sms: selectedCapabilities.includes('sms'),
            mms: selectedCapabilities.includes('sms'),
          },
          region: 'US',
          monthlyPrice: 1.00
        };
      });
      
      setNumberSearchResults(results);
      setIsSearching(false);
    }, 1000);
  };

  const handlePurchaseNumber = (number: string) => {
    toast({
      title: 'Number Purchased',
      description: `Successfully purchased ${formatPhoneNumber(number)}`,
    });
    setShowBuyNumberModal(false);
    setNumberSearchResults([]);
    refresh();
  };

  const getCapabilityBadges = (capabilities: { voice: boolean; sms: boolean; mms: boolean }) => {
    return (
      <div className="flex gap-1">
        {capabilities.voice && (
          <Badge variant="outline" className="text-xs">
            <PhoneCall className="w-3 h-3 mr-1" />
            Voice
          </Badge>
        )}
        {capabilities.sms && (
          <Badge variant="outline" className="text-xs">
            <MessageSquare className="w-3 h-3 mr-1" />
            SMS
          </Badge>
        )}
        {capabilities.mms && (
          <Badge variant="outline" className="text-xs">
            <ImageIcon className="w-3 h-3 mr-1" />
            MMS
          </Badge>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading phone numbers...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Phone Numbers</h2>
          <p className="text-muted-foreground">
            Manage your Elite Financial phone numbers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowBuyNumberModal(true)}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Buy Number
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Numbers</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalNumbers}</div>
            <p className="text-xs text-muted-foreground">Active phone numbers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Voice Enabled</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.voiceEnabled}</div>
            <p className="text-xs text-muted-foreground">Can make/receive calls</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS Enabled</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.smsEnabled}</div>
            <p className="text-xs text-muted-foreground">Can send/receive SMS</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MMS Enabled</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.mmsEnabled}</div>
            <p className="text-xs text-muted-foreground">Can send/receive MMS</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Phone Numbers</CardTitle>
              <CardDescription>View and manage your phone numbers</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search numbers..."
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
              <TabsTrigger value="active">Active Numbers ({phoneNumbers.length})</TabsTrigger>
              <TabsTrigger value="porting">Porting Status</TabsTrigger>
              <TabsTrigger value="usage">Usage</TabsTrigger>
            </TabsList>
            {/* Provider count badges */}
            <div className="flex gap-2 mt-3 mb-2">
              {Object.entries(providerCounts).map(([provider, count]) => (
                <Badge 
                  key={provider} 
                  variant="outline" 
                  className={
                    provider.toLowerCase() === 'twilio' 
                      ? 'border-red-300 text-red-600 bg-red-50' 
                      : provider.toLowerCase() === 'commio'
                      ? 'border-blue-300 text-blue-600 bg-blue-50'
                      : 'border-gray-300 text-gray-600 bg-gray-50'
                  }
                >
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}: {count} numbers
                </Badge>
              ))}
            </div>
            {/* Active Numbers Tab */}
            <TabsContent value="active" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('number')}>
                        <div className="flex items-center">
                          Phone Number
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>
                        <div className="flex items-center">
                          Account
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead>Capabilities</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort('date')}>
                        <div className="flex items-center">
                          Purchase Date
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNumbers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No phone numbers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredNumbers.map((number: any) => (
                        <TableRow 
                          key={number.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPreviewNumber(number)}
                        >
                          <TableCell className="font-medium font-mono">
                            {formatPhoneNumber(number.phoneNumber)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                number.provider?.toLowerCase() === 'twilio' 
                                  ? 'border-red-300 text-red-600 bg-red-50' 
                                  : number.provider?.toLowerCase() === 'commio'
                                  ? 'border-blue-300 text-blue-600 bg-blue-50'
                                  : 'border-gray-300 text-gray-600 bg-gray-50'
                              }
                            >
                              {number.provider ? number.provider.charAt(0).toUpperCase() + number.provider.slice(1) : 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{number.accountName || number.friendlyName}</TableCell>
                          <TableCell>{getCapabilityBadges(number.capabilities)}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(number.dateCreated).toLocaleDateString()}
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
                                <DropdownMenuItem onClick={() => setPreviewNumber(number)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>Configure</DropdownMenuItem>
                                <DropdownMenuItem>Release Number</DropdownMenuItem>
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
            </TabsContent>

            {/* Porting Status Tab */}
            <TabsContent value="porting" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Port Status</TableHead>
                      <TableHead>Submitted Date</TableHead>
                      <TableHead>Expected Completion</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <Phone className="h-12 w-12 text-muted-foreground/50" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No porting requests</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Port numbers from other carriers will appear here
                            </p>
                          </div>
                          <Button variant="outline" size="sm" className="mt-2">
                            <Plus className="h-4 w-4 mr-2" />
                            Start Port Request
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Usage Tab */}
            <TabsContent value="usage" className="mt-4">
              <div className="space-y-4">
                {/* Usage Summary Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Messages</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingUsage ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold">{usageData?.totals?.totalMessages?.toLocaleString() || 0}</div>
                          <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingUsage ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold">{usageData?.totals?.totalCalls?.toLocaleString() || 0}</div>
                          <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingUsage ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <div className="text-2xl font-bold">${usageData?.totals?.totalCost?.toFixed(2) || '0.00'}</div>
                          <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Usage by Number Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone Number</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Messages Sent</TableHead>
                        <TableHead className="text-right">Messages Received</TableHead>
                        <TableHead className="text-right">Calls Made</TableHead>
                        <TableHead className="text-right">Calls Received</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNumbers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">No usage data</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Usage statistics will appear here once you start using your numbers
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : loadingUsage ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredNumbers.map((number: any) => {
                          const usage = getUsageForNumber(number.phoneNumber);
                          const cost = usage 
                            ? (usage.messagesSent + usage.messagesReceived) * 0.0075 + (usage.callsMade + usage.callsReceived) * 0.013
                            : 0;
                          
                          return (
                            <TableRow key={number.id}>
                              <TableCell className="font-medium font-mono">
                                {formatPhoneNumber(number.phoneNumber)}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline" 
                                  className={
                                    number.provider?.toLowerCase() === 'twilio' 
                                      ? 'border-red-300 text-red-600 bg-red-50' 
                                      : number.provider?.toLowerCase() === 'commio'
                                      ? 'border-blue-300 text-blue-600 bg-blue-50'
                                      : 'border-gray-300 text-gray-600 bg-gray-50'
                                  }
                                >
                                  {number.provider ? number.provider.charAt(0).toUpperCase() + number.provider.slice(1) : 'Unknown'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{usage?.messagesSent?.toLocaleString() || 0}</TableCell>
                              <TableCell className="text-right">{usage?.messagesReceived?.toLocaleString() || 0}</TableCell>
                              <TableCell className="text-right">{usage?.callsMade?.toLocaleString() || 0}</TableCell>
                              <TableCell className="text-right">{usage?.callsReceived?.toLocaleString() || 0}</TableCell>
                              <TableCell className="text-right text-muted-foreground">${cost.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Number Details Modal */}
      <Dialog open={!!previewNumber} onOpenChange={() => setPreviewNumber(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Phone Number Details</DialogTitle>
            <DialogDescription>
              Complete information about this phone number
            </DialogDescription>
          </DialogHeader>
          {previewNumber && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Phone Number</Label>
                  <p className="text-sm font-medium font-mono mt-1">
                    {formatPhoneNumber(previewNumber.phoneNumber)}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Friendly Name</Label>
                  <p className="text-sm font-medium mt-1">{previewNumber.friendlyName}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Capabilities</Label>
                <div className="mt-1">{getCapabilityBadges(previewNumber.capabilities)}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Purchase Date</Label>
                  <p className="text-sm font-medium mt-1">
                    {new Date(previewNumber.dateCreated).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Number ID</Label>
                <p className="text-xs font-mono mt-1 text-muted-foreground">{previewNumber.id}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewNumber(null)}>
              Close
            </Button>
            <Button>
              Configure Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy Number Modal */}
      <Dialog open={showBuyNumberModal} onOpenChange={setShowBuyNumberModal}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Buy a Phone Number</DialogTitle>
            <DialogDescription>
              Search for available phone numbers to purchase
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Area Code</Label>
                <Input
                  placeholder="e.g., 855, 212, 415"
                  value={searchArea}
                  onChange={(e) => setSearchArea(e.target.value)}
                />
              </div>
              <div>
                <Label>Number Type</Label>
                <Select value={numberType} onValueChange={setNumberType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="tollfree">Toll-Free</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Required Capabilities</Label>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="voice"
                    checked={selectedCapabilities.includes('voice')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCapabilities([...selectedCapabilities, 'voice']);
                      } else {
                        setSelectedCapabilities(selectedCapabilities.filter(c => c !== 'voice'));
                      }
                    }}
                  />
                  <label htmlFor="voice" className="text-sm">Voice</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sms"
                    checked={selectedCapabilities.includes('sms')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCapabilities([...selectedCapabilities, 'sms']);
                      } else {
                        setSelectedCapabilities(selectedCapabilities.filter(c => c !== 'sms'));
                      }
                    }}
                  />
                  <label htmlFor="sms" className="text-sm">SMS/MMS</label>
                </div>
              </div>
            </div>

            <Button onClick={searchForNumbers} disabled={isSearching} className="w-full">
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Numbers
                </>
              )}
            </Button>

            {numberSearchResults.length > 0 && (
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Capabilities</TableHead>
                      <TableHead>Price/mo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {numberSearchResults.map((result, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono font-medium">
                          {formatPhoneNumber(result.number)}
                        </TableCell>
                        <TableCell>{getCapabilityBadges(result.capabilities)}</TableCell>
                        <TableCell>${result.monthlyPrice.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            onClick={() => handlePurchaseNumber(result.number)}
                          >
                            Buy
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowBuyNumberModal(false);
              setNumberSearchResults([]);
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
