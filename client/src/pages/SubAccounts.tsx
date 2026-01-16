/**
 * Sub-Accounts Management Page
 * 
 * Professional, interactive UI for managing sub-accounts.
 * Supports both Twilio and Commio providers based on selected account.
 * Uses shadcn/ui components for a modern, polished experience.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getInitials, getAvatarColor, formatNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useAccount } from "@/contexts/AccountContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  Search, 
  Building2, 
  CreditCard, 
  Phone,
  MessageSquare,
  Trash2,
  Edit,
  Eye,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  Download,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Settings,
  MoreHorizontal,
  Users,
  TrendingUp,
  Shield,
  Zap,
  Copy,
  ChevronRight,
  Activity,
  DollarSign
} from 'lucide-react';

// Provider type
type ProviderCode = 'twilio' | 'commio' | 'bandwidth';

// Types matching backend schema
interface SubAccount {
  id: string;
  parentId: string;
  name: string;
  friendlyName: string;
  accountSid: string | null;
  status: 'active' | 'suspended' | 'closed' | 'pending';
  type: 'subaccount';
  provider?: ProviderCode;
  phoneNumberCount: number;
  monthlySpend: number;
  createdAt?: string;
}

interface MasterAccount {
  id: string;
  name: string;
  friendlyName: string;
  type: 'master' | 'connected';
  status: string;
  provider?: ProviderCode;
  phoneNumberCount: number;
}

interface SubAccountDetails {
  id: number;
  name: string;
  friendlyName: string;
  accountSid: string;
  status: string;
  phoneNumbers: Array<{
    sid: string;
    phoneNumber: string;
    friendlyName: string;
    capabilities: any;
  }>;
  usage?: {
    messages: number;
    calls: number;
  };
}

export default function SubAccounts() {
  const { toast } = useToast();
  const { accounts: contextAccounts, refreshAccounts } = useAccount();
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [masterAccounts, setMasterAccounts] = useState<MasterAccount[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [selectedMaster, setSelectedMaster] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SubAccount | null>(null);
  const [accountDetails, setAccountDetails] = useState<SubAccountDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    friendlyName: '',
    parentAccountId: ''
  });

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
  };

  /**
   * Fetch master accounts from context
   */
  useEffect(() => {
    if (contextAccounts && contextAccounts.length > 0) {
      const masters = contextAccounts
        .filter(acc => acc.type === 'master' || (acc as any).type === 'connected')
        .map(acc => ({
          id: acc.id,
          name: acc.name,
          friendlyName: acc.friendlyName || acc.name,
          type: acc.type as 'master' | 'connected',
          status: acc.status,
          provider: (acc.provider as ProviderCode) || 'twilio',
          phoneNumberCount: acc.phoneNumberCount || 0
        }));
      setMasterAccounts(masters);
      
      // Auto-select first master if none selected
      if (!selectedMaster && masters.length > 0) {
        setSelectedMaster(masters[0].id);
      }
    }
    setIsLoading(false);
  }, [contextAccounts, selectedMaster]);

  // Get current selected master account and its provider
  const currentMaster = useMemo(() => {
    return masterAccounts.find(m => m.id === selectedMaster);
  }, [masterAccounts, selectedMaster]);

  const currentProvider = currentMaster?.provider || 'twilio';
  
  // Provider-specific configuration
  const providerConfig = useMemo(() => {
    const configs: Record<ProviderCode, { 
      name: string; 
      color: string; 
      bgColor: string;
      supportsSubAccounts: boolean;
      consoleUrl: string;
    }> = {
      twilio: {
        name: 'Twilio',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        supportsSubAccounts: true,
        consoleUrl: 'https://console.twilio.com'
      },
      commio: {
        name: 'Commio',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        supportsSubAccounts: false, // Commio doesn't have sub-accounts like Twilio
        consoleUrl: 'https://portal.commio.com'
      },
      bandwidth: {
        name: 'Bandwidth',
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
        supportsSubAccounts: true,
        consoleUrl: 'https://dashboard.bandwidth.com'
      }
    };
    return configs[currentProvider] || configs.twilio;
  }, [currentProvider]);

  /**
   * Fetch sub-accounts for selected master account
   */
  const fetchSubAccounts = useCallback(async () => {
    if (!selectedMaster) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/accounts/${selectedMaster}/subaccounts`);
      if (!response.ok) throw new Error('Failed to fetch sub-accounts');
      
      const data = await response.json();
      setSubAccounts(data.subAccounts || []);
    } catch (error) {
      console.error('Error fetching sub-accounts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sub-accounts',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedMaster, toast]);

  useEffect(() => {
    fetchSubAccounts();
  }, [fetchSubAccounts]);

  /**
   * Sync sub-accounts from Twilio
   */
  const handleSyncFromTwilio = async () => {
    if (!selectedMaster) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/accounts/${selectedMaster}/sync-subaccounts`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Sync failed');
      }
      
      const data = await response.json();
      toast({
        title: 'Sync Complete',
        description: `Imported ${data.imported || 0} sub-accounts from Twilio`
      });
      
      // Refresh the list
      await fetchSubAccounts();
      await refreshAccounts();
    } catch (error: any) {
      console.error('Error syncing:', error);
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not sync sub-accounts from Twilio',
        variant: 'destructive'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Create new sub-account
   */
  const handleCreateSubAccount = async () => {
    if (!formData.friendlyName || !formData.parentAccountId) return;
    
    setIsCreating(true);
    try {
      const response = await fetch(`/api/accounts/${formData.parentAccountId}/subaccounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendlyName: formData.friendlyName })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create sub-account');
      }
      
      const data = await response.json();
      toast({
        title: 'Sub-Account Created',
        description: `${data.account.friendlyName} has been created successfully`
      });
      
      setShowCreateModal(false);
      setFormData({ friendlyName: '', parentAccountId: '' });
      await fetchSubAccounts();
      await refreshAccounts();
    } catch (error: any) {
      console.error('Error creating sub-account:', error);
      toast({
        title: 'Creation Failed',
        description: error.message || 'Could not create sub-account',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Suspend sub-account
   */
  const handleSuspend = async (account: SubAccount) => {
    try {
      const response = await fetch(`/api/subaccounts/${account.id}/suspend`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to suspend account');
      
      toast({
        title: 'Account Suspended',
        description: `${account.friendlyName} has been suspended`
      });
      
      await fetchSubAccounts();
    } catch (error) {
      console.error('Error suspending:', error);
      toast({
        title: 'Error',
        description: 'Failed to suspend account',
        variant: 'destructive'
      });
    }
  };

  /**
   * Activate sub-account
   */
  const handleActivate = async (account: SubAccount) => {
    try {
      const response = await fetch(`/api/subaccounts/${account.id}/activate`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to activate account');
      
      toast({
        title: 'Account Activated',
        description: `${account.friendlyName} has been activated`
      });
      
      await fetchSubAccounts();
    } catch (error) {
      console.error('Error activating:', error);
      toast({
        title: 'Error',
        description: 'Failed to activate account',
        variant: 'destructive'
      });
    }
  };

  /**
   * View sub-account details
   */
  const handleViewDetails = async (account: SubAccount) => {
    setSelectedAccount(account);
    setShowDetailsModal(true);
    setIsLoadingDetails(true);
    
    try {
      const response = await fetch(`/api/subaccounts/${account.id}`);
      if (!response.ok) throw new Error('Failed to fetch details');
      
      const data = await response.json();
      setAccountDetails(data);
    } catch (error) {
      console.error('Error fetching details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load account details',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  /**
   * Close sub-account (permanent)
   */
  const handleClose = async (account: SubAccount) => {
    if (!confirm(`Are you sure you want to permanently close ${account.friendlyName}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/subaccounts/${account.id}/close`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to close account');
      
      toast({
        title: 'Account Closed',
        description: `${account.friendlyName} has been permanently closed`,
        variant: 'destructive'
      });
      
      await fetchSubAccounts();
      await refreshAccounts();
    } catch (error) {
      console.error('Error closing:', error);
      toast({
        title: 'Error',
        description: 'Failed to close account',
        variant: 'destructive'
      });
    }
  };

  // Filter accounts
  const filteredAccounts = subAccounts.filter(account => {
    const matchesSearch = 
      account.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.friendlyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.accountSid?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: subAccounts.length,
    active: subAccounts.filter(a => a.status === 'active').length,
    suspended: subAccounts.filter(a => a.status === 'suspended').length,
    totalPhoneNumbers: subAccounts.reduce((sum, a) => sum + (a.phoneNumberCount || 0), 0)
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Suspended
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <XCircle className="w-3 h-3 mr-1" />
            Closed
          </span>
        );
      default:
        return null;
    }
  };

  // Loading state
  if (isLoading && masterAccounts.length === 0) {
    return (
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading accounts...</span>
        </div>
      </div>
    );
  }

  // Calculate total monthly spend
  const totalMonthlySpend = subAccounts.reduce((sum, a) => sum + (a.monthlySpend || 0), 0);

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Sub-Account Management</h1>
            {currentMaster && (
              <Badge className={`${providerConfig.bgColor} ${providerConfig.color} border-0`}>
                {providerConfig.name}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            {providerConfig.supportsSubAccounts 
              ? `Manage ${providerConfig.name} sub-accounts for multi-tenant operations`
              : `${providerConfig.name} account management - sub-accounts not supported`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSyncFromTwilio}
            disabled={isSyncing || !selectedMaster}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync from {providerConfig.name}
          </Button>
          {providerConfig.supportsSubAccounts && (
            <Button
              onClick={() => {
                setFormData({ ...formData, parentAccountId: selectedMaster || '' });
                setShowCreateModal(true);
              }}
              disabled={!selectedMaster}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Sub-Account
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.open(providerConfig.consoleUrl, '_blank')}
            title={`Open ${providerConfig.name} Console`}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Master Account Selector Card */}
      {masterAccounts.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${providerConfig.bgColor}`}>
                  <Building2 className={`w-5 h-5 ${providerConfig.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">Master Account</p>
                  <p className="text-xs text-muted-foreground">Select the parent account to manage</p>
                </div>
              </div>
              <div className="flex-1 md:max-w-xs">
                <Select value={selectedMaster || ''} onValueChange={setSelectedMaster}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select master account" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterAccounts.map(master => {
                      const providerColors: Record<string, { bg: string; text: string }> = {
                        twilio: { bg: 'bg-red-100', text: 'text-red-700' },
                        commio: { bg: 'bg-blue-100', text: 'text-blue-700' },
                        bandwidth: { bg: 'bg-purple-100', text: 'text-purple-700' }
                      };
                      const colors = providerColors[master.provider || 'twilio'] || providerColors.twilio;
                      return (
                        <SelectItem key={master.id} value={master.id}>
                          <div className="flex items-center gap-2">
                            <span>{master.friendlyName}</span>
                            <Badge className={`${colors.bg} ${colors.text} border-0 text-xs`}>
                              {master.provider || 'twilio'}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {currentMaster && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>{currentMaster.phoneNumberCount} phone numbers</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Master Account Warning */}
      {masterAccounts.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-semibold text-yellow-800">No Master Account Connected</h3>
                <p className="text-yellow-700 mt-1 text-sm">
                  Connect a Twilio or Commio account first to manage accounts. Go to Settings to add your credentials.
                </p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <a href="/settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Go to Settings
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider doesn't support sub-accounts notice */}
      {currentMaster && !providerConfig.supportsSubAccounts && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${providerConfig.bgColor}`}>
                <Building2 className={`w-6 h-6 ${providerConfig.color}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800">{providerConfig.name} Account</h3>
                <p className="text-blue-700 mt-1 text-sm">
                  {providerConfig.name} doesn't use sub-accounts like Twilio. Your account is managed as a single entity.
                  You can still view your phone numbers, messages, and usage from the Dashboard and Analytics pages.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/dashboard">
                      <Activity className="w-4 h-4 mr-2" />
                      View Dashboard
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.open(providerConfig.consoleUrl, '_blank')}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open {providerConfig.name} Console
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards - Interactive Grid (only for providers that support sub-accounts) */}
      {providerConfig.supportsSubAccounts && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="group hover:shadow-lg transition-all duration-300 hover:border-primary/50 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Sub-Accounts</p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    All accounts
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <Progress value={100} className="mt-4 h-1" />
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg transition-all duration-300 hover:border-green-500/50 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{stats.active}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                    <Zap className="w-3 h-3 mr-1" />
                    Operational
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-green-100 rounded-xl group-hover:bg-green-200 transition-colors">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <Progress 
              value={stats.total > 0 ? (stats.active / stats.total) * 100 : 0} 
              className="mt-4 h-1 [&>div]:bg-green-500" 
            />
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg transition-all duration-300 hover:border-red-500/50 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Suspended</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{stats.suspended}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Badge variant="destructive" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    Paused
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-red-100 rounded-xl group-hover:bg-red-200 transition-colors">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <Progress 
              value={stats.total > 0 ? (stats.suspended / stats.total) * 100 : 0} 
              className="mt-4 h-1 [&>div]:bg-red-500" 
            />
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg transition-all duration-300 hover:border-purple-500/50 cursor-pointer">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone Numbers</p>
                <p className="text-3xl font-bold mt-1 text-purple-600">{stats.totalPhoneNumbers}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Badge className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-100">
                    <Phone className="w-3 h-3 mr-1" />
                    Assigned
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
                <Phone className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <Progress value={75} className="mt-4 h-1 [&>div]:bg-purple-500" />
          </CardContent>
        </Card>
      </div>
      )}

      {/* Main Content Card (only for providers that support sub-accounts) */}
      {providerConfig.supportsSubAccounts && (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Sub-Accounts</CardTitle>
              <CardDescription>
                {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search accounts..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'table')}>
                <TabsList className="h-9">
                  <TabsTrigger value="grid" className="px-3">
                    <Building2 className="w-4 h-4" />
                  </TabsTrigger>
                  <TabsTrigger value="table" className="px-3">
                    <Activity className="w-4 h-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading sub-accounts...</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No sub-accounts found</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filters' 
                  : 'Create a sub-account or sync existing ones from Twilio'}
              </p>
              {!searchQuery && statusFilter === 'all' && selectedMaster && (
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={handleSyncFromTwilio} disabled={isSyncing}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync from Twilio
                  </Button>
                  <Button onClick={() => {
                    setFormData({ ...formData, parentAccountId: selectedMaster });
                    setShowCreateModal(true);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Sub-Account
                  </Button>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map((account) => (
                <Card 
                  key={account.id} 
                  className="group hover:shadow-md transition-all duration-200 hover:border-primary/30"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg shadow-sm"
                          style={{ backgroundColor: getAvatarColor(account.friendlyName || account.name) }}
                        >
                          {getInitials(account.friendlyName || account.name)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-base">{account.friendlyName || account.name}</h3>
                          <p className="text-xs text-muted-foreground">Sub-Account</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleViewDetails(account)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {account.status === 'active' ? (
                            <DropdownMenuItem onClick={() => handleSuspend(account)} className="text-orange-600">
                              <XCircle className="w-4 h-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          ) : account.status === 'suspended' ? (
                            <DropdownMenuItem onClick={() => handleActivate(account)} className="text-green-600">
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <a href="https://console.twilio.com/us1/account/manage-accounts/subaccounts" target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              View in Twilio
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleClose(account)} 
                            className="text-red-600"
                            disabled={account.status === 'closed'}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Close Account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge 
                          variant={account.status === 'active' ? 'default' : account.status === 'suspended' ? 'destructive' : 'secondary'}
                          className={account.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                        >
                          {account.status === 'active' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {account.status === 'suspended' && <XCircle className="w-3 h-3 mr-1" />}
                          {account.status === 'closed' && <Clock className="w-3 h-3 mr-1" />}
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Account SID</span>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {account.accountSid || 'N/A'}
                          </code>
                          {account.accountSid && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(account.accountSid!, 'Account SID')}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Phone Numbers</span>
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{account.phoneNumberCount || 0}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Monthly Spend</span>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{(account.monthlySpend || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleViewDetails(account)}
                      >
                        View Details
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Account SID</TableHead>
                    <TableHead className="text-center">Phone Numbers</TableHead>
                    <TableHead className="text-right">Monthly Spend</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-medium"
                            style={{ backgroundColor: getAvatarColor(account.friendlyName || account.name) }}
                          >
                            {getInitials(account.friendlyName || account.name)}
                          </div>
                          <div>
                            <p className="font-medium">{account.friendlyName || account.name}</p>
                            <p className="text-xs text-muted-foreground">Sub-Account</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={account.status === 'active' ? 'default' : account.status === 'suspended' ? 'destructive' : 'secondary'}
                          className={account.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                        >
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {account.accountSid || 'N/A'}
                        </code>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          {account.phoneNumberCount || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${(account.monthlySpend || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(account)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {account.status === 'active' ? (
                              <DropdownMenuItem onClick={() => handleSuspend(account)} className="text-orange-600">
                                <XCircle className="w-4 h-4 mr-2" />
                                Suspend
                              </DropdownMenuItem>
                            ) : account.status === 'suspended' ? (
                              <DropdownMenuItem onClick={() => handleActivate(account)} className="text-green-600">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleClose(account)} 
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Close Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sub-Account</DialogTitle>
            <DialogDescription>
              Create a new {providerConfig.name} sub-account under your master account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Parent Account</label>
              <Select 
                value={formData.parentAccountId} 
                onValueChange={(value) => setFormData({ ...formData, parentAccountId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent account" />
                </SelectTrigger>
                <SelectContent>
                  {masterAccounts.map(master => (
                    <SelectItem key={master.id} value={master.id}>
                      {master.friendlyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Friendly Name *</label>
              <Input
                value={formData.friendlyName}
                onChange={(e) => setFormData({ ...formData, friendlyName: e.target.value })}
                placeholder="e.g., Client ABC"
              />
              <p className="text-xs text-muted-foreground">
                This will be the display name in Twilio Console
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData({ friendlyName: '', parentAccountId: '' });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubAccount}
              disabled={isCreating || !formData.friendlyName || !formData.parentAccountId}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedAccount?.friendlyName}</DialogTitle>
                <DialogDescription>Sub-Account Details</DialogDescription>
              </div>
              {selectedAccount && (
                <Badge 
                  variant={selectedAccount.status === 'active' ? 'default' : selectedAccount.status === 'suspended' ? 'destructive' : 'secondary'}
                  className={selectedAccount.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                >
                  {selectedAccount.status.charAt(0).toUpperCase() + selectedAccount.status.slice(1)}
                </Badge>
              )}
            </div>
          </DialogHeader>
          <div className="py-4">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading details...</span>
              </div>
            ) : accountDetails ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Account Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Account SID</span>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded">{accountDetails.accountSid}</code>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => copyToClipboard(accountDetails.accountSid, 'Account SID')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium">{accountDetails.status}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Friendly Name</span>
                      <span className="font-medium">{accountDetails.friendlyName}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Phone Numbers ({accountDetails.phoneNumbers?.length || 0})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {accountDetails.phoneNumbers && accountDetails.phoneNumbers.length > 0 ? (
                      <div className="space-y-2">
                        {accountDetails.phoneNumbers.map(pn => (
                          <div key={pn.sid} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="font-mono font-medium">{pn.phoneNumber}</p>
                              <p className="text-sm text-muted-foreground">{pn.friendlyName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {pn.capabilities?.sms && (
                                <Badge variant="secondary" className="text-xs">SMS</Badge>
                              )}
                              {pn.capabilities?.voice && (
                                <Badge variant="secondary" className="text-xs">Voice</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No phone numbers assigned
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Failed to load account details
              </div>
            )}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="outline" asChild>
              <a
                href="https://console.twilio.com/us1/account/manage-accounts/subaccounts"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View in Twilio
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowDetailsModal(false);
                setSelectedAccount(null);
                setAccountDetails(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
