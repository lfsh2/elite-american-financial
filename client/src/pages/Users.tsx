import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../components/ui/use-toast';
import { getInitials, getAvatarColor } from "@/lib/utils";
import {
  Users as UsersIcon,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Mail,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Download,
  RefreshCw,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Phone,
  PhoneCall
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: 'super_admin' | 'user';
  status: 'active' | 'inactive' | 'suspended';
  credits: number;
  createdAt: string;
  lastLogin?: string;
  assignedPhoneNumber?: string;
  phoneAssignments?: PhoneAssignment[];
}

interface PhoneAssignment {
  id: number;
  phoneNumberId: number;
  phoneNumber: string;
  friendlyName?: string;
  accountName?: string;
  isPrimary: boolean;
  canSend: boolean;
  canReceive: boolean;
}

interface AvailablePhoneNumber {
  id: number;
  phoneNumber: string;
  friendlyName: string | null;
  accountId: number;
  accountName?: string;
  provider?: string;
  isAssigned?: boolean;
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'email' | 'role' | 'created'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'user' as 'super_admin' | 'user',
    status: 'active' as 'active' | 'inactive' | 'suspended',
    credits: 100
  });
  
  // Phone assignment state
  const [showPhoneAssignModal, setShowPhoneAssignModal] = useState(false);
  const [availablePhoneNumbers, setAvailablePhoneNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<number | null>(null);
  const [selectedPhoneNumberIds, setSelectedPhoneNumberIds] = useState<number[]>([]);
  const [isLoadingPhones, setIsLoadingPhones] = useState(false);
  const [phoneProviderFilter, setPhoneProviderFilter] = useState<string>('all');
  const [phoneSearchQuery, setPhoneSearchQuery] = useState('');
  
  // Pricing configuration state
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingData, setPricingData] = useState({
    smsOutboundRate: '0.015',
    smsInboundRate: '0.01',
    mmsOutboundRate: '0.05',
    mmsInboundRate: '0.03',
    monthlyPhoneNumberFee: '0',
    billingCycleDay: 1
  });
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);
  
  // Credit management state
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [userCredits, setUserCredits] = useState<{ balance: number; rates: any } | null>(null);
  const [creditTransactions, setCreditTransactions] = useState<any[]>([]);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        const mappedUsers: User[] = data.map((u: any) => ({
          id: u.id,
          username: u.username,
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          email: u.email,
          phone: u.phone || undefined,
          role: u.role || 'user',
          status: u.status || 'active',
          credits: u.credits || 0,
          createdAt: u.createdAt || new Date().toISOString(),
          lastLogin: u.lastLogin || undefined
        }));
        setUsers(mappedUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    adminUsers: users.filter(u => u.role === 'super_admin').length,
    suspendedUsers: users.filter(u => u.status === 'suspended').length,
  };

  // Fetch available phone numbers for assignment
  const fetchAvailablePhones = async () => {
    setIsLoadingPhones(true);
    try {
      const response = await fetch('/api/phone-numbers/available');
      if (response.ok) {
        const data = await response.json();
        setAvailablePhoneNumbers(data);
      }
    } catch (error) {
      console.error('Error fetching available phones:', error);
    } finally {
      setIsLoadingPhones(false);
    }
  };

  // Get unique providers from available phone numbers
  const availableProviders = useMemo(() => {
    const providers = new Set(availablePhoneNumbers.map(p => p.provider || 'unknown'));
    return Array.from(providers).sort();
  }, [availablePhoneNumbers]);

  // Filter phone numbers by provider and search query
  const filteredPhoneNumbers = useMemo(() => {
    return availablePhoneNumbers.filter(phone => {
      const matchesProvider = phoneProviderFilter === 'all' || phone.provider === phoneProviderFilter;
      const matchesSearch = phoneSearchQuery === '' || 
        phone.phoneNumber.includes(phoneSearchQuery) ||
        phone.friendlyName?.toLowerCase().includes(phoneSearchQuery.toLowerCase()) ||
        phone.accountName?.toLowerCase().includes(phoneSearchQuery.toLowerCase());
      return matchesProvider && matchesSearch;
    });
  }, [availablePhoneNumbers, phoneProviderFilter, phoneSearchQuery]);

  // Toggle phone number selection for multi-select
  const togglePhoneSelection = (phoneId: number) => {
    setSelectedPhoneNumberIds(prev => {
      if (prev.includes(phoneId)) {
        return prev.filter(id => id !== phoneId);
      } else {
        // Check if adding would exceed limit
        const currentAssignments = selectedUser?.phoneAssignments?.length || 0;
        if (currentAssignments + prev.length >= 10) {
          toast({
            title: 'Limit Reached',
            description: 'Maximum 10 phone numbers per user',
            variant: 'destructive'
          });
          return prev;
        }
        return [...prev, phoneId];
      }
    });
  };

  // Select all filtered unassigned phones (up to limit)
  const selectAllFiltered = () => {
    const currentAssignments = selectedUser?.phoneAssignments?.length || 0;
    const remainingSlots = 10 - currentAssignments;
    const unassignedFiltered = filteredPhoneNumbers.filter(p => !p.isAssigned);
    const toSelect = unassignedFiltered.slice(0, remainingSlots).map(p => p.id);
    setSelectedPhoneNumberIds(toSelect);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedPhoneNumberIds([]);
  };

  // Assign multiple phone numbers to user
  const handleAssignPhones = async () => {
    if (!selectedUser || selectedPhoneNumberIds.length === 0) return;
    
    setIsLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
      for (const phoneNumberId of selectedPhoneNumberIds) {
        try {
          const response = await fetch(`/api/users/${selectedUser.id}/phone-assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumberId,
              isPrimary: successCount === 0, // First one is primary
              canSend: true,
              canReceive: true,
              assignedBy: currentUser?.id
            })
          });
          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Phones Assigned',
          description: `${successCount} phone number(s) assigned successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`,
        });
        setShowPhoneAssignModal(false);
        setSelectedPhoneNumberIds([]);
        setSelectedPhoneNumberId(null);
        setPhoneProviderFilter('all');
        setPhoneSearchQuery('');
        fetchUsers();
      } else {
        throw new Error('All assignments failed');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign phone numbers',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Assign single phone number to user (legacy)
  const handleAssignPhone = async () => {
    if (!selectedUser || !selectedPhoneNumberId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${selectedUser.id}/phone-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: selectedPhoneNumberId,
          isPrimary: true,
          canSend: true,
          canReceive: true,
          assignedBy: currentUser?.id
        })
      });

      if (response.ok) {
        toast({
          title: 'Phone Assigned',
          description: 'Phone number has been assigned to the user.',
        });
        setShowPhoneAssignModal(false);
        setSelectedPhoneNumberId(null);
        fetchUsers();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to assign phone');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign phone number',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Open phone assignment modal
  const openPhoneAssignModal = (user: User) => {
    setSelectedUser(user);
    fetchAvailablePhones();
    setShowPhoneAssignModal(true);
  };

  // Fetch user pricing config
  const fetchUserPricing = async (userId: number) => {
    setIsLoadingPricing(true);
    try {
      const response = await fetch(`/api/users/${userId}/pricing`);
      if (response.ok) {
        const data = await response.json();
        setPricingData({
          smsOutboundRate: data.smsOutboundRate || '0.015',
          smsInboundRate: data.smsInboundRate || '0.01',
          mmsOutboundRate: data.mmsOutboundRate || '0.05',
          mmsInboundRate: data.mmsInboundRate || '0.03',
          monthlyPhoneNumberFee: data.monthlyPhoneNumberFee || '0',
          billingCycleDay: data.billingCycleDay || 1
        });
      }
    } catch (error) {
      console.error('Error fetching user pricing:', error);
    } finally {
      setIsLoadingPricing(false);
    }
  };

  // Open pricing modal
  const openPricingModal = (user: User) => {
    setSelectedUser(user);
    fetchUserPricing(user.id);
    setShowPricingModal(true);
  };

  // Save pricing configuration
  const handleSavePricing = async () => {
    if (!selectedUser) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${selectedUser.id}/pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricingData)
      });

      if (response.ok) {
        toast({
          title: 'Pricing Updated',
          description: 'User pricing configuration has been saved.',
        });
        setShowPricingModal(false);
      } else {
        throw new Error('Failed to save pricing');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save pricing configuration',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch user credits and transactions
  const fetchUserCredits = async (userId: number) => {
    setIsLoadingCredits(true);
    try {
      const [creditsRes, transactionsRes] = await Promise.all([
        fetch(`/api/users/${userId}/credits`),
        fetch(`/api/users/${userId}/credits/transactions?limit=10`)
      ]);
      
      if (creditsRes.ok) {
        const data = await creditsRes.json();
        setUserCredits(data);
      }
      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setCreditTransactions(data);
      }
    } catch (error) {
      console.error('Error fetching user credits:', error);
    } finally {
      setIsLoadingCredits(false);
    }
  };

  // Open credits modal
  const openCreditsModal = (user: User) => {
    setSelectedUser(user);
    setCreditAmount('');
    setCreditDescription('');
    fetchUserCredits(user.id);
    setShowCreditsModal(true);
  };

  // Add credits to user
  const handleAddCredits = async () => {
    if (!selectedUser || !creditAmount) return;
    
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive number',
        variant: 'destructive'
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${selectedUser.id}/credits/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: creditDescription || `Added ${amount} credits`
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Credits Added',
          description: `Successfully added ${amount} credits. New balance: ${result.balance}`,
        });
        // Refresh credits and user list
        fetchUserCredits(selectedUser.id);
        fetchUsers();
        setCreditAmount('');
        setCreditDescription('');
      } else {
        throw new Error('Failed to add credits');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add credits',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const matchesSearch = searchQuery === '' || 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      
      return matchesSearch && matchesRole && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const aVal = sortField === 'name' ? `${a.firstName} ${a.lastName}` :
                   sortField === 'email' ? a.email :
                   sortField === 'role' ? a.role :
                   new Date(a.createdAt).getTime();
      const bVal = sortField === 'name' ? `${b.firstName} ${b.lastName}` :
                   sortField === 'email' ? b.email :
                   sortField === 'role' ? b.role :
                   new Date(b.createdAt).getTime();
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [users, searchQuery, roleFilter, statusFilter, sortField, sortOrder]);

  const toggleSort = (field: 'name' | 'email' | 'role' | 'created') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </Badge>
      );
    } else if (status === 'suspended') {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" />
          Suspended
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          <AlertCircle className="w-3 h-3 mr-1" />
          Inactive
        </Badge>
      );
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'super_admin') {
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
          <Shield className="w-3 h-3 mr-1" />
          Super Admin
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          <UserCheck className="w-3 h-3 mr-1" />
          Client
        </Badge>
      );
    }
  };

  const handleCreateUser = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast({
          title: 'User Created',
          description: 'New user has been created successfully.',
        });
        setShowCreateModal(false);
        fetchUsers();
        setFormData({
          username: '',
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          password: '',
          role: 'user',
          status: 'active',
          credits: 100
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create user',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast({
          title: 'User Updated',
          description: 'User has been updated successfully.',
        });
        setShowEditModal(false);
        fetchUsers();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.message || 'Failed to update user',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    // Confirm before deleting
    const confirmed = window.confirm('Are you sure you want to delete this user? This action cannot be undone.');
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: 'User Deleted',
          description: 'User has been deleted successfully.',
        });
        fetchUsers();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete user',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive'
      });
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role,
      status: user.status,
      credits: user.credits
    });
    setShowEditModal(true);
  };

  if (isLoadingUsers) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading users...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">All registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administrators</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.adminUsers}</div>
            <p className="text-xs text-muted-foreground">Admin accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.suspendedUsers}</div>
            <p className="text-xs text-muted-foreground">Suspended accounts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>View and manage all user accounts</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  className="pl-8 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('email')}>
                    <div className="flex items-center">
                      Email
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('role')}>
                    <div className="flex items-center">
                      Role
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('created')}>
                    <div className="flex items-center">
                      Created
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback style={{ backgroundColor: getAvatarColor(user.username) }}>
                              {getInitials(`${user.firstName} ${user.lastName}`)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{user.firstName} {user.lastName}</div>
                            <div className="text-sm text-muted-foreground">@{user.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell className="font-mono">{user.credits}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
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
                            <DropdownMenuItem onClick={() => openEditModal(user)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPhoneAssignModal(user)}>
                              <Phone className="mr-2 h-4 w-4" />
                              Assign Phone Number
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPricingModal(user)}>
                              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Set Pricing
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCreditsModal(user)}>
                              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Manage Credits
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="mr-2 h-4 w-4" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user account to the system
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({...formData, role: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Client</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v: any) => setFormData({...formData, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user account information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v: any) => setFormData({...formData, role: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Client</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v: any) => setFormData({...formData, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone Assignment Modal */}
      <Dialog open={showPhoneAssignModal} onOpenChange={setShowPhoneAssignModal}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Assign Phone Numbers
            </DialogTitle>
            <DialogDescription>
              Assign phone numbers to {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-hidden flex-1">
            {/* Phone number limit indicator */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Phone Numbers Assigned</span>
              <div className="flex items-center gap-2">
                {selectedPhoneNumberIds.length > 0 && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    +{selectedPhoneNumberIds.length} selected
                  </Badge>
                )}
                <Badge variant={selectedUser?.phoneAssignments && selectedUser.phoneAssignments.length >= 10 ? "destructive" : "secondary"}>
                  {selectedUser?.phoneAssignments?.length || 0} / 10
                </Badge>
              </div>
            </div>
            
            {selectedUser?.phoneAssignments && selectedUser.phoneAssignments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Current Assignments ({selectedUser.phoneAssignments.length})</Label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {selectedUser.phoneAssignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="h-4 w-4 text-green-600" />
                        <div>
                          <div className="font-medium text-sm">{assignment.phoneNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {assignment.friendlyName} • {assignment.accountName}
                          </div>
                        </div>
                      </div>
                      {assignment.isPrimary && (
                        <Badge className="bg-green-100 text-green-800">Primary</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Filter Controls */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Filter & Select Numbers</Label>
              <div className="flex gap-2">
                <Select value={phoneProviderFilter} onValueChange={setPhoneProviderFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {availableProviders.map(provider => (
                      <SelectItem key={provider} value={provider}>
                        {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search numbers..."
                  value={phoneSearchQuery}
                  onChange={(e) => setPhoneSearchQuery(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {filteredPhoneNumbers.filter(p => !p.isAssigned).length} available of {filteredPhoneNumbers.length} shown
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                    Select All ({Math.min(filteredPhoneNumbers.filter(p => !p.isAssigned).length, 10 - (selectedUser?.phoneAssignments?.length || 0))})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAllSelections}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Phone Numbers List */}
            <div className="space-y-2 flex-1 overflow-hidden">
              {isLoadingPhones ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                  {filteredPhoneNumbers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No phone numbers match your filter
                    </div>
                  ) : (
                    filteredPhoneNumbers.map((phone) => (
                      <div 
                        key={phone.id}
                        className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedPhoneNumberIds.includes(phone.id) ? 'bg-blue-50' : ''
                        } ${phone.isAssigned ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => !phone.isAssigned && togglePhoneSelection(phone.id)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPhoneNumberIds.includes(phone.id)}
                          onChange={() => !phone.isAssigned && togglePhoneSelection(phone.id)}
                          disabled={phone.isAssigned}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{phone.phoneNumber}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {phone.friendlyName} • {phone.accountName}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {phone.provider || 'unknown'}
                          </Badge>
                          {phone.isAssigned && (
                            <Badge variant="secondary" className="text-xs">Assigned</Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowPhoneAssignModal(false);
              setSelectedPhoneNumberId(null);
              setSelectedPhoneNumberIds([]);
              setPhoneProviderFilter('all');
              setPhoneSearchQuery('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignPhones} 
              disabled={isLoading || selectedPhoneNumberIds.length === 0 || (selectedUser?.phoneAssignments?.length || 0) >= 10}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Assign {selectedPhoneNumberIds.length} Phone{selectedPhoneNumberIds.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Configuration Modal */}
      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Usage-Based Pricing
            </DialogTitle>
            <DialogDescription>
              Set messaging rates for {selectedUser?.firstName} {selectedUser?.lastName}. Charges are calculated per message.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingPricing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              {/* SMS Rates */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  SMS Rates
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Outbound (per SMS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="pl-7"
                        value={pricingData.smsOutboundRate}
                        onChange={(e) => setPricingData({...pricingData, smsOutboundRate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Inbound (per SMS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="pl-7"
                        value={pricingData.smsInboundRate}
                        onChange={(e) => setPricingData({...pricingData, smsInboundRate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* MMS Rates */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  MMS Rates
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Outbound (per MMS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="pl-7"
                        value={pricingData.mmsOutboundRate}
                        onChange={(e) => setPricingData({...pricingData, mmsOutboundRate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Inbound (per MMS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="pl-7"
                        value={pricingData.mmsInboundRate}
                        onChange={(e) => setPricingData({...pricingData, mmsInboundRate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Fee & Billing Cycle */}
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Additional Settings
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Monthly Phone Fee</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="pl-7"
                        value={pricingData.monthlyPhoneNumberFee}
                        onChange={(e) => setPricingData({...pricingData, monthlyPhoneNumberFee: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Billing Cycle Day</Label>
                    <Select 
                      value={pricingData.billingCycleDay.toString()} 
                      onValueChange={(v) => setPricingData({...pricingData, billingCycleDay: parseInt(v)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 5, 10, 15, 20, 25].map(day => (
                          <SelectItem key={day} value={day.toString()}>
                            {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of month
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium text-gray-700 mb-1">Pricing Summary</p>
                <p>• SMS: ${pricingData.smsOutboundRate}/out, ${pricingData.smsInboundRate}/in</p>
                <p>• MMS: ${pricingData.mmsOutboundRate}/out, ${pricingData.mmsInboundRate}/in</p>
                {parseFloat(pricingData.monthlyPhoneNumberFee) > 0 && (
                  <p>• Monthly fee: ${pricingData.monthlyPhoneNumberFee}/phone</p>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPricingModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePricing} disabled={isLoading || isLoadingPricing}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Pricing'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credits Management Modal */}
      <Dialog open={showCreditsModal} onOpenChange={setShowCreditsModal}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Manage Credits
            </DialogTitle>
            <DialogDescription>
              Add or manage credits for {selectedUser?.firstName} {selectedUser?.lastName}
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingCredits ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              {/* Current Balance */}
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 font-medium">Current Balance</p>
                    <p className="text-3xl font-bold text-green-700">{userCredits?.balance || 0}</p>
                    <p className="text-xs text-green-600">credits available</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Credit Rates</p>
                    <p className="text-xs">SMS: {userCredits?.rates?.smsOutboundCredits || 1} credit</p>
                    <p className="text-xs">MMS: {userCredits?.rates?.mmsOutboundCredits || 3} credits</p>
                  </div>
                </div>
              </div>

              {/* Add Credits Form */}
              <div className="space-y-3 pt-2 border-t">
                <h4 className="text-sm font-semibold text-gray-700">Add Credits</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Amount</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="100"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                    <Input
                      placeholder="Reason for adding credits"
                      value={creditDescription}
                      onChange={(e) => setCreditDescription(e.target.value)}
                    />
                  </div>
                </div>
                <Button 
                  onClick={handleAddCredits} 
                  disabled={isLoading || !creditAmount}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add {creditAmount || '0'} Credits
                    </>
                  )}
                </Button>
              </div>

              {/* Recent Transactions */}
              {creditTransactions.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="text-sm font-semibold text-gray-700">Recent Transactions</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {creditTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${tx.amount > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.description}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
