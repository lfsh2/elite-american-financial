import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccount } from '../contexts/AccountContext';
import { 
  Megaphone, 
  Plus, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Building2,
  Search,
  Filter,
  MoreHorizontal,
  Shield,
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
import { useToast } from '../components/ui/use-toast';

interface Brand {
  sid: string;
  accountSid: string;
  friendlyName: string;
  status: string;
  identityStatus: string;
  dateCreated: string;
}

interface Campaign {
  sid: string;
  accountSid: string;
  messagingServiceSid: string;
  friendlyName: string;
  description: string;
  status: string;
  usecaseType: string;
  dateCreated: string;
}

interface MessagingService {
  sid: string;
  accountSid: string;
  friendlyName: string;
  dateCreated: string;
}

interface A2PSummary {
  brands: Brand[];
  campaigns: Campaign[];
  messagingServices: MessagingService[];
}

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentAccount, isOverviewMode } = useAccount();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [a2pData, setA2pData] = useState<A2PSummary | null>(null);

  useEffect(() => {
    fetchA2PData();
  }, [currentAccount]);

  const fetchA2PData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/compliance/a2p/summary', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setA2pData(data);
      } else {
        console.error('Failed to fetch A2P data');
        toast({
          title: 'Error',
          description: 'Failed to load campaign data',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error fetching A2P data:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect to API',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/compliance/a2p/sync', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Sync Complete',
          description: result.message || 'A2P data synced successfully',
        });
        await fetchA2PData();
      } else {
        toast({
          title: 'Sync Failed',
          description: 'Failed to sync A2P data from Twilio',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error syncing A2P data:', error);
      toast({
        title: 'Error',
        description: 'Failed to sync data',
        variant: 'destructive'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'approved' || statusLower === 'verified' || statusLower === 'active') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          {status}
        </Badge>
      );
    } else if (statusLower === 'pending' || statusLower === 'in-review') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          <Clock className="w-3 h-3 mr-1" />
          {status}
        </Badge>
      );
    } else if (statusLower === 'failed' || statusLower === 'rejected') {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" />
          {status}
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

  const campaigns = Array.isArray(a2pData?.campaigns) ? a2pData.campaigns : [];
  const brands = Array.isArray(a2pData?.brands) ? a2pData.brands : [];
  const messagingServices = Array.isArray(a2pData?.messagingServices) ? a2pData.messagingServices : [];

  const filteredCampaigns = campaigns.filter(c => 
    searchQuery === '' || 
    c.friendlyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredBrands = brands.filter(b => 
    searchQuery === '' || 
    b.friendlyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status.toLowerCase() === 'active').length,
    totalBrands: brands.length,
    approvedBrands: brands.filter(b => b.status.toLowerCase() === 'approved').length,
    messagingServices: messagingServices.length
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading campaigns...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Campaigns & A2P Compliance</h2>
          <p className="text-muted-foreground">
            Manage your messaging campaigns and A2P 10DLC registrations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync from Twilio
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCampaigns}</div>
            <p className="text-xs text-muted-foreground">Registered campaigns</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">Active campaigns</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Brands</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBrands}</div>
            <p className="text-xs text-muted-foreground">Registered brands</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Brands</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approvedBrands}</div>
            <p className="text-xs text-muted-foreground">Verified brands</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.messagingServices}</div>
            <p className="text-xs text-muted-foreground">Messaging services</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>A2P 10DLC Management</CardTitle>
              <CardDescription>View and manage your Twilio/Commio campaigns and brand registrations</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
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
              <TabsTrigger value="campaigns">Campaigns ({stats.totalCampaigns})</TabsTrigger>
              <TabsTrigger value="brands">Brands ({stats.totalBrands})</TabsTrigger>
              <TabsTrigger value="services">Services ({stats.messagingServices})</TabsTrigger>
            </TabsList>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Use Case</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Account SID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No campaigns found. Click "Sync from Twilio" to import your campaigns.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCampaigns.map((campaign) => (
                        <TableRow key={campaign.sid} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{campaign.friendlyName}</TableCell>
                          <TableCell className="capitalize">{campaign.usecaseType.replace(/_/g, ' ')}</TableCell>
                          <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                          <TableCell className="font-mono text-xs">{campaign.accountSid.substring(0, 20)}...</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(campaign.dateCreated).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Edit Campaign</DropdownMenuItem>
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

            {/* Brands Tab */}
            <TabsContent value="brands" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Identity Status</TableHead>
                      <TableHead>Account SID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBrands.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No brands found. Click "Sync from Twilio" to import your brand registrations.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBrands.map((brand) => (
                        <TableRow key={brand.sid} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{brand.friendlyName}</TableCell>
                          <TableCell>{getStatusBadge(brand.status)}</TableCell>
                          <TableCell>{getStatusBadge(brand.identityStatus)}</TableCell>
                          <TableCell className="font-mono text-xs">{brand.accountSid.substring(0, 20)}...</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(brand.dateCreated).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Edit Brand</DropdownMenuItem>
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

            {/* Messaging Services Tab */}
            <TabsContent value="services" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service Name</TableHead>
                      <TableHead>Service SID</TableHead>
                      <TableHead>Account SID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messagingServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No messaging services found. Click "Sync from Twilio" to import your services.
                        </TableCell>
                      </TableRow>
                    ) : (
                      messagingServices.map((service) => (
                        <TableRow key={service.sid} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{service.friendlyName}</TableCell>
                          <TableCell className="font-mono text-xs">{service.sid}</TableCell>
                          <TableCell className="font-mono text-xs">{service.accountSid.substring(0, 20)}...</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(service.dateCreated).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Configure</DropdownMenuItem>
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
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
