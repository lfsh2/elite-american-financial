import React, { useState } from 'react';
import { getInitials, getAvatarColor, formatNumber } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Building2, 
  Users, 
  CreditCard, 
  Phone,
  Mail,
  MessageSquare,
  Settings,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  Filter,
  Download,
  ChevronDown,
  Shield,
  Key,
  Globe
} from 'lucide-react';

interface SubAccount {
  id: number;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  status: 'active' | 'suspended' | 'pending';
  credits: number;
  monthlyUsage: number;
  phoneNumbers: number;
  apiKey: string;
  createdAt: string;
  lastActivity: string;
  whiteLabel: {
    enabled: boolean;
    brandName: string;
    primaryColor: string;
    logo?: string;
  };
  limits: {
    monthlyMessages: number;
    monthlyMinutes: number;
    phoneNumbers: number;
  };
}

export default function SubAccounts() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SubAccount | null>(null);
  const [showApiKey, setShowApiKey] = useState<number | null>(null);

  // Form state for create/edit
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    credits: 1000,
    whiteLabelEnabled: false,
    brandName: '',
    primaryColor: '#3B82F6',
    monthlyMessages: 10000,
    monthlyMinutes: 1000,
    phoneNumbers: 5
  });

  // Mock sub-accounts data
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([
    {
      id: 1,
      name: 'John Smith',
      companyName: 'Acme Corp',
      email: 'john@acmecorp.com',
      phone: '+1 (555) 123-4567',
      status: 'active',
      credits: 5000,
      monthlyUsage: 2340,
      phoneNumbers: 3,
      apiKey: 'sk_live_abc123def456ghi789',
      createdAt: '2024-06-15T10:30:00Z',
      lastActivity: '2025-05-12T14:30:00Z',
      whiteLabel: {
        enabled: true,
        brandName: 'Acme Messaging',
        primaryColor: '#EF4444'
      },
      limits: {
        monthlyMessages: 10000,
        monthlyMinutes: 1000,
        phoneNumbers: 5
      }
    },
    {
      id: 2,
      name: 'Sarah Johnson',
      companyName: 'TechStart Inc',
      email: 'sarah@techstart.io',
      phone: '+1 (555) 987-6543',
      status: 'active',
      credits: 12500,
      monthlyUsage: 8750,
      phoneNumbers: 8,
      apiKey: 'sk_live_xyz789abc123def456',
      createdAt: '2024-08-20T09:15:00Z',
      lastActivity: '2025-05-12T16:45:00Z',
      whiteLabel: {
        enabled: true,
        brandName: 'TechComms',
        primaryColor: '#10B981'
      },
      limits: {
        monthlyMessages: 25000,
        monthlyMinutes: 2500,
        phoneNumbers: 10
      }
    },
    {
      id: 3,
      name: 'Mike Davis',
      companyName: 'Local Biz Solutions',
      email: 'mike@localbiz.com',
      phone: '+1 (555) 456-7890',
      status: 'pending',
      credits: 500,
      monthlyUsage: 0,
      phoneNumbers: 1,
      apiKey: 'sk_live_pending123456789',
      createdAt: '2025-05-10T14:00:00Z',
      lastActivity: '2025-05-10T14:00:00Z',
      whiteLabel: {
        enabled: false,
        brandName: '',
        primaryColor: '#3B82F6'
      },
      limits: {
        monthlyMessages: 5000,
        monthlyMinutes: 500,
        phoneNumbers: 3
      }
    },
    {
      id: 4,
      name: 'Emily Chen',
      companyName: 'Global Retail Co',
      email: 'emily@globalretail.com',
      phone: '+1 (555) 321-0987',
      status: 'suspended',
      credits: 0,
      monthlyUsage: 15000,
      phoneNumbers: 12,
      apiKey: 'sk_live_suspended987654321',
      createdAt: '2024-03-01T11:30:00Z',
      lastActivity: '2025-04-28T09:00:00Z',
      whiteLabel: {
        enabled: true,
        brandName: 'RetailConnect',
        primaryColor: '#8B5CF6'
      },
      limits: {
        monthlyMessages: 50000,
        monthlyMinutes: 5000,
        phoneNumbers: 15
      }
    }
  ]);

  // Filter accounts
  const filteredAccounts = subAccounts.filter(account => {
    const matchesSearch = 
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: subAccounts.length,
    active: subAccounts.filter(a => a.status === 'active').length,
    totalCredits: subAccounts.reduce((sum, a) => sum + a.credits, 0),
    totalPhoneNumbers: subAccounts.reduce((sum, a) => sum + a.phoneNumbers, 0)
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
      default:
        return null;
    }
  };

  const handleCreateAccount = () => {
    const newAccount: SubAccount = {
      id: Math.max(...subAccounts.map(a => a.id)) + 1,
      name: formData.name,
      companyName: formData.companyName,
      email: formData.email,
      phone: formData.phone,
      status: 'pending',
      credits: formData.credits,
      monthlyUsage: 0,
      phoneNumbers: 0,
      apiKey: `sk_live_${Math.random().toString(36).substring(2, 20)}`,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      whiteLabel: {
        enabled: formData.whiteLabelEnabled,
        brandName: formData.brandName,
        primaryColor: formData.primaryColor
      },
      limits: {
        monthlyMessages: formData.monthlyMessages,
        monthlyMinutes: formData.monthlyMinutes,
        phoneNumbers: formData.phoneNumbers
      }
    };
    setSubAccounts([...subAccounts, newAccount]);
    setShowCreateModal(false);
    resetForm();
    toast({
      title: 'Sub-account created',
      description: `${newAccount.companyName} has been created successfully.`
    });
  };

  const handleEditAccount = () => {
    if (!selectedAccount) return;
    setSubAccounts(subAccounts.map(account => 
      account.id === selectedAccount.id
        ? {
            ...account,
            name: formData.name,
            companyName: formData.companyName,
            email: formData.email,
            phone: formData.phone,
            credits: formData.credits,
            whiteLabel: {
              enabled: formData.whiteLabelEnabled,
              brandName: formData.brandName,
              primaryColor: formData.primaryColor
            },
            limits: {
              monthlyMessages: formData.monthlyMessages,
              monthlyMinutes: formData.monthlyMinutes,
              phoneNumbers: formData.phoneNumbers
            }
          }
        : account
    ));
    setShowEditModal(false);
    setSelectedAccount(null);
    resetForm();
    toast({
      title: 'Sub-account updated',
      description: 'Changes have been saved successfully.'
    });
  };

  const handleDeleteAccount = () => {
    if (!selectedAccount) return;
    setSubAccounts(subAccounts.filter(a => a.id !== selectedAccount.id));
    setShowDeleteModal(false);
    setSelectedAccount(null);
    toast({
      title: 'Sub-account deleted',
      description: `${selectedAccount.companyName} has been removed.`,
      variant: 'destructive'
    });
  };

  const handleToggleStatus = (account: SubAccount) => {
    const newStatus = account.status === 'active' ? 'suspended' : 'active';
    setSubAccounts(subAccounts.map(a => 
      a.id === account.id ? { ...a, status: newStatus } : a
    ));
    toast({
      title: `Account ${newStatus}`,
      description: `${account.companyName} has been ${newStatus}.`
    });
  };

  const handleRegenerateApiKey = (account: SubAccount) => {
    const newKey = `sk_live_${Math.random().toString(36).substring(2, 20)}`;
    setSubAccounts(subAccounts.map(a => 
      a.id === account.id ? { ...a, apiKey: newKey } : a
    ));
    toast({
      title: 'API key regenerated',
      description: 'A new API key has been generated. Make sure to update your integrations.'
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: 'API key has been copied.'
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      companyName: '',
      email: '',
      phone: '',
      credits: 1000,
      whiteLabelEnabled: false,
      brandName: '',
      primaryColor: '#3B82F6',
      monthlyMessages: 10000,
      monthlyMinutes: 1000,
      phoneNumbers: 5
    });
  };

  const openEditModal = (account: SubAccount) => {
    setSelectedAccount(account);
    setFormData({
      name: account.name,
      companyName: account.companyName,
      email: account.email,
      phone: account.phone,
      credits: account.credits,
      whiteLabelEnabled: account.whiteLabel.enabled,
      brandName: account.whiteLabel.brandName,
      primaryColor: account.whiteLabel.primaryColor,
      monthlyMessages: account.limits.monthlyMessages,
      monthlyMinutes: account.limits.monthlyMinutes,
      phoneNumbers: account.limits.phoneNumbers
    });
    setShowEditModal(true);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Sub-Accounts</h1>
          <p className="text-gray-500">Manage white-label client accounts and their resources</p>
        </div>
        <button 
          className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={16} className="mr-2" />
          Create Sub-Account
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Accounts</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Accounts</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Credits</p>
              <p className="text-2xl font-bold">{formatNumber(stats.totalCredits)}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Phone Numbers</p>
              <p className="text-2xl font-bold">{stats.totalPhoneNumbers}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Phone className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, company, or email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
            <Download size={18} className="mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">White Label</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">API Key</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAccounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                        style={{ backgroundColor: getAvatarColor(account.companyName) }}
                      >
                        {getInitials(account.companyName)}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-gray-900">{account.companyName}</div>
                        <div className="text-sm text-gray-500">{account.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(account.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{formatNumber(account.credits)}</div>
                    <div className="text-xs text-gray-500">{account.phoneNumbers} numbers</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatNumber(account.monthlyUsage)} / {formatNumber(account.limits.monthlyMessages)}</div>
                    <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1">
                      <div 
                        className="bg-blue-600 h-1.5 rounded-full" 
                        style={{ width: `${Math.min(100, (account.monthlyUsage / account.limits.monthlyMessages) * 100)}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.whiteLabel.enabled ? (
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-2" 
                          style={{ backgroundColor: account.whiteLabel.primaryColor }}
                        ></div>
                        <span className="text-sm text-gray-900">{account.whiteLabel.brandName}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not enabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                        {showApiKey === account.id 
                          ? account.apiKey 
                          : `${account.apiKey.substring(0, 10)}...`}
                      </code>
                      <button 
                        onClick={() => setShowApiKey(showApiKey === account.id ? null : account.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {showApiKey === account.id ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button 
                        onClick={() => copyToClipboard(account.apiKey)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowDetailsModal(true);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="View Details"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                      <button 
                        onClick={() => openEditModal(account)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(account)}
                        className={`p-1 ${account.status === 'active' ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`}
                        title={account.status === 'active' ? 'Suspend' : 'Activate'}
                      >
                        {account.status === 'active' ? <XCircle size={18} /> : <CheckCircle size={18} />}
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowDeleteModal(true);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredAccounts.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sub-accounts found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by creating your first sub-account'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Create Sub-Account
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Create Sub-Account</h2>
              <p className="text-gray-500 text-sm mt-1">Set up a new white-label client account</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-gray-400" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@acmecorp.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Credits & Limits */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2 text-gray-400" />
                  Credits & Limits
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Credits</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.credits}
                      onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Message Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.monthlyMessages}
                      onChange={(e) => setFormData({ ...formData, monthlyMessages: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Minutes Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.monthlyMinutes}
                      onChange={(e) => setFormData({ ...formData, monthlyMinutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.phoneNumbers}
                      onChange={(e) => setFormData({ ...formData, phoneNumbers: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              {/* White Label */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-gray-400" />
                  White Label Settings
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={formData.whiteLabelEnabled}
                      onChange={(e) => setFormData({ ...formData, whiteLabelEnabled: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable white-label branding</span>
                  </label>
                  {formData.whiteLabelEnabled && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={formData.brandName}
                          onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                          placeholder="Client's Brand"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          />
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAccount}
                disabled={!formData.name || !formData.companyName || !formData.email}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Edit Sub-Account</h2>
              <p className="text-gray-500 text-sm mt-1">Update {selectedAccount.companyName}'s settings</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Same form fields as create */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-gray-400" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2 text-gray-400" />
                  Credits & Limits
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credits</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.credits}
                      onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Message Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.monthlyMessages}
                      onChange={(e) => setFormData({ ...formData, monthlyMessages: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Minutes Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.monthlyMinutes}
                      onChange={(e) => setFormData({ ...formData, monthlyMinutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number Limit</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.phoneNumbers}
                      onChange={(e) => setFormData({ ...formData, phoneNumbers: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-gray-400" />
                  White Label Settings
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={formData.whiteLabelEnabled}
                      onChange={(e) => setFormData({ ...formData, whiteLabelEnabled: e.target.checked })}
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable white-label branding</span>
                  </label>
                  {formData.whiteLabelEnabled && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={formData.brandName}
                          onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          />
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* API Key Section */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4 flex items-center">
                  <Key className="w-5 h-5 mr-2 text-gray-400" />
                  API Key
                </h3>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                  <code className="flex-1 text-sm font-mono">{selectedAccount.apiKey}</code>
                  <button 
                    onClick={() => copyToClipboard(selectedAccount.apiKey)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <Copy size={16} />
                  </button>
                  <button 
                    onClick={() => handleRegenerateApiKey(selectedAccount)}
                    className="flex items-center px-3 py-1 text-sm text-orange-600 hover:bg-orange-50 rounded"
                  >
                    <RefreshCw size={14} className="mr-1" />
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => { setShowEditModal(false); setSelectedAccount(null); resetForm(); }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleEditAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-center mb-2">Delete Sub-Account</h3>
              <p className="text-gray-500 text-center mb-6">
                Are you sure you want to delete <strong>{selectedAccount.companyName}</strong>? 
                This will permanently remove all their data, phone numbers, and API access.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setSelectedAccount(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div className="flex items-center">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium mr-4"
                  style={{ backgroundColor: getAvatarColor(selectedAccount.companyName) }}
                >
                  {getInitials(selectedAccount.companyName)}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{selectedAccount.companyName}</h2>
                  <p className="text-gray-500 text-sm">{selectedAccount.email}</p>
                </div>
              </div>
              {getStatusBadge(selectedAccount.status)}
            </div>
            <div className="p-6 space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(selectedAccount.credits)}</p>
                  <p className="text-sm text-gray-500">Credits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{selectedAccount.phoneNumbers}</p>
                  <p className="text-sm text-gray-500">Phone Numbers</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(selectedAccount.monthlyUsage)}</p>
                  <p className="text-sm text-gray-500">Messages This Month</p>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Users className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedAccount.name}
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Phone className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedAccount.phone}
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Mail className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedAccount.email}
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Clock className="w-4 h-4 mr-2 text-gray-400" />
                    Created {new Date(selectedAccount.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Usage Limits */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Usage & Limits</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Messages</span>
                      <span className="text-gray-900">{formatNumber(selectedAccount.monthlyUsage)} / {formatNumber(selectedAccount.limits.monthlyMessages)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(100, (selectedAccount.monthlyUsage / selectedAccount.limits.monthlyMessages) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Phone Numbers</span>
                      <span className="text-gray-900">{selectedAccount.phoneNumbers} / {selectedAccount.limits.phoneNumbers}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${(selectedAccount.phoneNumbers / selectedAccount.limits.phoneNumbers) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* White Label */}
              {selectedAccount.whiteLabel.enabled && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">White Label Branding</h3>
                  <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div 
                      className="w-10 h-10 rounded-lg"
                      style={{ backgroundColor: selectedAccount.whiteLabel.primaryColor }}
                    ></div>
                    <div>
                      <p className="font-medium">{selectedAccount.whiteLabel.brandName}</p>
                      <p className="text-sm text-gray-500">{selectedAccount.whiteLabel.primaryColor}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* API Key */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">API Access</h3>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                  <Key className="w-5 h-5 text-gray-400" />
                  <code className="flex-1 text-sm font-mono">{selectedAccount.apiKey}</code>
                  <button 
                    onClick={() => copyToClipboard(selectedAccount.apiKey)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-between">
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  openEditModal(selectedAccount);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 flex items-center"
              >
                <Edit size={16} className="mr-2" />
                Edit Account
              </button>
              <button
                onClick={() => { setShowDetailsModal(false); setSelectedAccount(null); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}