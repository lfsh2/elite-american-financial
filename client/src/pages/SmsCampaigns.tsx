import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccount } from '../contexts/AccountContext';
import { 
  Upload,
  Send,
  Users,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Play,
  Pause,
  BarChart3,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Loader2,
  Phone,
  User,
  Mail,
  ChevronRight,
  Zap,
  Target,
  TrendingUp,
  RefreshCw,
  Hash,
  CheckSquare
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '../components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface Contact {
  id?: number;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  selected?: boolean;
  [key: string]: any; // Support custom fields from CSV
}

interface ContactList {
  id: number;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
}

interface SmsCampaign {
  id: number;
  name: string;
  description?: string;
  messageTemplate: string;
  fromNumber: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  capabilities?: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
  accountId?: string;
  accountName?: string;
  provider?: string;
}

export default function SmsCampaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentAccount } = useAccount();
  
  // State
  const [activeTab, setActiveTab] = useState('campaigns');
  const [isLoading, setIsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  
  // Upload state
  const [uploadedContacts, setUploadedContacts] = useState<Contact[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // New campaign dialog
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignStep, setCampaignStep] = useState(1);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    messageTemplate: '',
    fromNumber: '',
    fromAccountId: '',
    contactListId: '',
  });
  
  // Multi-select phone numbers for batch sending (Twilio-style)
  const [numberSelectionMode, setNumberSelectionMode] = useState<'all' | 'select' | 'single'>('all');
  const [selectedFromNumbers, setSelectedFromNumbers] = useState<Set<string>>(new Set());
  const [sendingProgress, setSendingProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [showProgress, setShowProgress] = useState(false);
  
  // Provider filter: 'all', 'commio', or 'twilio'
  const [providerFilter, setProviderFilter] = useState<'all' | 'commio' | 'twilio'>('all');
  
  // Drip mode settings
  const [dripMode, setDripMode] = useState(false);
  const [messagesPerMinute, setMessagesPerMinute] = useState(30); // Safe default
  const [estimatedCompletion, setEstimatedCompletion] = useState<Date | null>(null);
  
  // New contact list dialog
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  
  // Campaign sending
  const [isSending, setIsSending] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<SmsCampaign | null>(null);

  // Filter phone numbers by provider (memoized to prevent infinite loops)
  const filteredNumbers = useMemo(() => {
    if (providerFilter === 'all') return phoneNumbers;
    return phoneNumbers.filter(pn => pn.provider === providerFilter);
  }, [phoneNumbers, providerFilter]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [currentAccount]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const accountId = currentAccount?.id ? parseInt(String(currentAccount.id).replace('acc_', '')) : undefined;
      console.log('Fetching data for accountId:', accountId);
      
      // Fetch campaigns
      const campaignsRes = await fetch(`/api/campaigns/sms-campaigns${accountId ? `?accountId=${accountId}` : ''}`, {
        credentials: 'include'
      });
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }

      // Fetch contact lists
      const listsUrl = `/api/campaigns/contact-lists${accountId ? `?accountId=${accountId}` : ''}`;
      console.log('Fetching contact lists from:', listsUrl);
      const listsRes = await fetch(listsUrl, {
        credentials: 'include'
      });
      if (listsRes.ok) {
        const data = await listsRes.json();
        console.log('Fetched contact lists:', data.lists);
        setContactLists(data.lists || []);
      } else {
        console.error('Failed to fetch contact lists:', listsRes.status);
      }

      // Fetch phone numbers from Twilio/Commio account
      if (currentAccount?.id) {
        const phonesRes = await fetch(`/api/accounts/${currentAccount.id}/phone-numbers`, {
          credentials: 'include'
        });
        if (phonesRes.ok) {
          const data = await phonesRes.json();
          // Only include numbers if account is Twilio or Commio
          const accountsRes = await fetch('/api/accounts', { credentials: 'include' });
          if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            const account = accountsData.accounts?.find((acc: any) => acc.id === currentAccount.id);
            if (account?.provider === 'twilio' || account?.provider === 'commio') {
              setPhoneNumbers(data.phoneNumbers || []);
            } else {
              setPhoneNumbers([]); // Don't show numbers from other providers
            }
          }
        }
      } else {
        // Fetch from all accounts if no specific account selected
        const accountsRes = await fetch('/api/accounts', { credentials: 'include' });
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json();
          const allPhoneNumbers: any[] = [];
          
          for (const acc of accountsData.accounts || []) {
            try {
              const phonesRes = await fetch(`/api/accounts/${acc.id}/phone-numbers`, {
                credentials: 'include'
              });
              if (phonesRes.ok) {
                const data = await phonesRes.json();
                // Only include Twilio and Commio numbers for SMS sending
                const numbersWithAccount = (data.phoneNumbers || [])
                  .filter((pn: any) => acc.provider === 'twilio' || acc.provider === 'commio')
                  .map((pn: any) => ({
                    ...pn,
                    accountId: acc.id,
                    accountName: acc.name,
                    provider: acc.provider
                  }));
                allPhoneNumbers.push(...numbersWithAccount);
              }
            } catch (e) {
              console.error(`Failed to fetch phone numbers for account ${acc.id}:`, e);
            }
          }
          setPhoneNumbers(allPhoneNumbers);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaign data',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Parse CSV file with proper handling of quoted fields
  const parseCSV = (text: string): Contact[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      toast({
        title: 'Invalid CSV',
        description: 'CSV file must contain headers and at least one row',
        variant: 'destructive'
      });
      return [];
    }

    // Helper function to parse CSV line with quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));
    const firstNameIndex = headers.findIndex(h => h.includes('first') || h === 'name');
    const lastNameIndex = headers.findIndex(h => h.includes('last'));
    const emailIndex = headers.findIndex(h => h.includes('email'));

    if (phoneIndex === -1) {
      toast({
        title: 'Invalid CSV',
        description: 'CSV must contain a phone number column',
        variant: 'destructive'
      });
      return [];
    }

    const contacts: Contact[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values[phoneIndex]) {
        // Build contact object with all fields
        const contact: any = {
          phoneNumber: values[phoneIndex],
          firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
          lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
          email: emailIndex >= 0 ? values[emailIndex] : undefined,
          selected: true,
        };

        // Add custom fields (e.g., dollar_amount, company, etc.)
        headers.forEach((header, index) => {
          if (index !== phoneIndex && index !== firstNameIndex && 
              index !== lastNameIndex && index !== emailIndex && values[index]) {
            // Convert header to snake_case for consistency
            const fieldName = header.replace(/\s+/g, '_').toLowerCase();
            contact[fieldName] = values[index];
          }
        });

        contacts.push(contact);
      }
    }
    return contacts;
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const text = await file.text();
      setUploadProgress(30);
      
      const contacts = parseCSV(text);
      setUploadProgress(70);
      
      setUploadedContacts(contacts);
      setUploadProgress(100);
      
      toast({
        title: 'File Uploaded',
        description: `Found ${contacts.length} contacts in the file`,
      });
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to parse the CSV file',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete contact list
  const handleDeleteList = async (listId: number, listName: string) => {
    if (!confirm(`Are you sure you want to delete "${listName}"? This will also delete all contacts in this list.`)) {
      return;
    }

    console.log('Deleting contact list:', listId, listName);

    try {
      const res = await fetch(`/api/campaigns/contact-lists/${listId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      console.log('Delete response status:', res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Delete failed:', errorData);
        throw new Error(errorData.error || 'Failed to delete contact list');
      }

      const result = await res.json();
      console.log('Delete successful:', result);

      // Immediately update the UI by filtering out the deleted list
      setContactLists(prev => {
        const updated = prev.filter(list => list.id !== listId);
        console.log('Updated contact lists:', updated);
        return updated;
      });

      toast({
        title: 'Success',
        description: 'Contact list deleted successfully',
      });

      // Refresh data to ensure consistency
      console.log('Refreshing data...');
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting contact list:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete contact list',
        variant: 'destructive'
      });
    }
  };

  // Create contact list and import contacts
  const handleCreateListAndImport = async () => {
    if (!newListName || uploadedContacts.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a list name and upload contacts',
        variant: 'destructive'
      });
      return;
    }

    try {
      const accountId = currentAccount?.id ? parseInt(String(currentAccount.id).replace('acc_', '')) : undefined;
      
      // Create contact list
      const listRes = await fetch('/api/campaigns/contact-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId,
          name: newListName,
          description: newListDescription,
        }),
      });

      if (!listRes.ok) throw new Error('Failed to create contact list');
      const listData = await listRes.json();

      // Import contacts
      const selectedContacts = uploadedContacts.filter(c => c.selected);
      const importRes = await fetch('/api/campaigns/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId,
          contactListId: listData.id,
          contacts: selectedContacts,
        }),
      });

      if (!importRes.ok) throw new Error('Failed to import contacts');
      const importData = await importRes.json();

      toast({
        title: 'Success',
        description: `Created list "${newListName}" with ${importData.imported} contacts`,
      });

      // Reset and refresh
      setShowNewList(false);
      setNewListName('');
      setNewListDescription('');
      setUploadedContacts([]);
      fetchData();
    } catch (error: any) {
      console.error('Error creating list:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create contact list',
        variant: 'destructive'
      });
    }
  };

  // Create SMS campaign
  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.messageTemplate || !newCampaign.fromNumber) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      const accountId = currentAccount?.id ? parseInt(String(currentAccount.id).replace('acc_', '')) : undefined;
      
      // Create campaign
      const res = await fetch('/api/campaigns/sms-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId: newCampaign.fromAccountId ? parseInt(String(newCampaign.fromAccountId).replace('acc_', '')) : accountId,
          name: newCampaign.name,
          description: newCampaign.description,
          messageTemplate: newCampaign.messageTemplate,
          fromNumber: newCampaign.fromNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to create campaign');
      const data = await res.json();

      // Add recipients if contact list selected
      if (newCampaign.contactListId) {
        await fetch(`/api/campaigns/sms-campaigns/${data.campaign.id}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            contactListId: parseInt(newCampaign.contactListId),
          }),
        });
      }

      toast({
        title: 'Campaign Created',
        description: `Campaign "${newCampaign.name}" created successfully`,
      });

      // Reset and refresh
      setShowNewCampaign(false);
      setCampaignStep(1);
      setNewCampaign({
        name: '',
        description: '',
        messageTemplate: '',
        fromNumber: '',
        fromAccountId: '',
        contactListId: '',
      });
      fetchData();
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create campaign',
        variant: 'destructive'
      });
    }
  };

  // Start campaign with batch sending
  const handleStartCampaign = async (campaignId: number, campaign?: SmsCampaign) => {
    // Determine which numbers to use (respects provider filter)
    let numbersToUse: string[] = [];
    if (numberSelectionMode === 'all') {
      numbersToUse = filteredNumbers.map(pn => pn.phoneNumber);
    } else if (numberSelectionMode === 'select') {
      numbersToUse = Array.from(selectedFromNumbers);
    } else if (campaign?.fromNumber) {
      numbersToUse = [campaign.fromNumber];
    }

    if (numbersToUse.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one phone number',
        variant: 'destructive'
      });
      return;
    }

    setIsSending(true);
    setShowProgress(true);
    setSendingProgress({ sent: 0, failed: 0, total: 0 });

    try {
      // First get campaign recipients
      const recipientsRes = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/recipients`, {
        credentials: 'include',
      });
      
      if (!recipientsRes.ok) {
        throw new Error('Failed to fetch campaign recipients');
      }
      
      const recipientsData = await recipientsRes.json();
      const recipients = recipientsData.recipients || [];
      
      if (recipients.length === 0) {
        throw new Error('No recipients in campaign. Add a contact list first.');
      }

      setSendingProgress({ sent: 0, failed: 0, total: recipients.length });

      // Build phone number configs
      const phoneNumberConfigs = numbersToUse.map(num => {
        const phoneData = phoneNumbers.find(pn => pn.phoneNumber === num);
        return {
          phoneNumber: num,
          provider: phoneData?.provider || 'twilio',
          accountId: phoneData?.accountId,
        };
      });

      // Use batch API for parallel sending with drip mode
      const batchRes = await fetch('/api/sms/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipients: recipients.map((r: any) => ({
            phone: r.phoneNumber,
            name: r.firstName ? `${r.firstName} ${r.lastName || ''}`.trim() : undefined,
            firstName: r.firstName,
            lastName: r.lastName,
          })),
          message: campaign?.messageTemplate || '',
          phoneNumbers: phoneNumberConfigs,
          campaignId,
          userId: 1,
          messagesPerNumber: 2000,
          concurrentPerNumber: dripMode ? 1 : 20,
          dripMode,
          messagesPerMinute,
        }),
      });

      if (batchRes.ok) {
        const result = await batchRes.json();
        setSendingProgress({ sent: result.sent, failed: result.failed, total: recipients.length });
        
        // Update campaign status
        await fetch(`/api/campaigns/sms-campaigns/${campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            status: 'completed',
            sentCount: result.sent,
            failedCount: result.failed,
          }),
        });

        toast({
          title: 'Campaign Completed',
          description: `Sent ${result.sent} messages, ${result.failed} failed (${result.duration}ms)`,
        });
      } else {
        throw new Error('Batch send failed');
      }

      fetchData();
    } catch (error: any) {
      console.error('Error starting campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start campaign',
        variant: 'destructive'
      });
    } finally {
      setIsSending(false);
      setTimeout(() => setShowProgress(false), 3000);
    }
  };

  // Pause campaign
  const handlePauseCampaign = async (campaignId: number) => {
    try {
      const res = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/pause`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to pause campaign');

      toast({
        title: 'Campaign Paused',
        description: 'Campaign has been paused',
      });

      fetchData();
    } catch (error: any) {
      console.error('Error pausing campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to pause campaign',
        variant: 'destructive'
      });
    }
  };

  // Toggle contact selection
  const toggleContactSelection = (index: number) => {
    setUploadedContacts(prev => 
      prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c)
    );
  };

  // Select all contacts
  const selectAllContacts = (selected: boolean) => {
    setUploadedContacts(prev => prev.map(c => ({ ...c, selected })));
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'completed') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    } else if (statusLower === 'sending') {
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Sending
        </Badge>
      );
    } else if (statusLower === 'scheduled') {
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
          <Clock className="w-3 h-3 mr-1" />
          Scheduled
        </Badge>
      );
    } else if (statusLower === 'paused') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          <Pause className="w-3 h-3 mr-1" />
          Paused
        </Badge>
      );
    } else if (statusLower === 'draft') {
      return (
        <Badge variant="outline">
          <AlertCircle className="w-3 h-3 mr-1" />
          Draft
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline">
          {status}
        </Badge>
      );
    }
  };

  // Calculate stats
  const stats = {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status === 'sending').length,
    completedCampaigns: campaigns.filter(c => c.status === 'completed').length,
    totalSent: campaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0),
    totalDelivered: campaigns.reduce((sum, c) => sum + (c.deliveredCount || 0), 0),
    totalContacts: contactLists.reduce((sum, l) => sum + (l.contactCount || 0), 0),
  };

  const deliveryRate = stats.totalSent > 0 
    ? Math.round((stats.totalDelivered / stats.totalSent) * 100) 
    : 0;

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading campaigns...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">SMS Campaigns</h2>
          <p className="text-muted-foreground">
            Create and manage your SMS marketing campaigns
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={showNewList} onOpenChange={setShowNewList}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Import Contacts
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Import Contacts</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with your contacts to create a new contact list
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* List Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="listName">List Name *</Label>
                    <Input
                      id="listName"
                      placeholder="e.g., January Leads"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listDesc">Description</Label>
                    <Input
                      id="listDesc"
                      placeholder="Optional description"
                      value={newListDescription}
                      onChange={(e) => setNewListDescription(e.target.value)}
                    />
                  </div>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label>Upload CSV File</Label>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                      <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-sm font-medium">
                        {isUploading ? 'Processing...' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        CSV file with columns: Phone, First Name, Last Name, Email
                      </p>
                    </label>
                    {isUploading && (
                      <Progress value={uploadProgress} className="mt-4 w-48 mx-auto" />
                    )}
                  </div>
                </div>

                {/* Preview Table */}
                {uploadedContacts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Preview ({uploadedContacts.filter(c => c.selected).length} of {uploadedContacts.length} selected)</Label>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => selectAllContacts(true)}
                        >
                          Select All
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => selectAllContacts(false)}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[300px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">
                              <Checkbox 
                                checked={uploadedContacts.every(c => c.selected)}
                                onCheckedChange={(checked) => selectAllContacts(!!checked)}
                              />
                            </TableHead>
                            <TableHead>Phone Number</TableHead>
                            <TableHead>First Name</TableHead>
                            <TableHead>Last Name</TableHead>
                            <TableHead>Email</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uploadedContacts.map((contact, index) => (
                            <TableRow key={index} className={!contact.selected ? 'opacity-50' : ''}>
                              <TableCell>
                                <Checkbox 
                                  checked={contact.selected}
                                  onCheckedChange={() => toggleContactSelection(index)}
                                />
                              </TableCell>
                              <TableCell className="font-mono">{contact.phoneNumber}</TableCell>
                              <TableCell>{contact.firstName || '-'}</TableCell>
                              <TableCell>{contact.lastName || '-'}</TableCell>
                              <TableCell>{contact.email || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewList(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateListAndImport}
                  disabled={!newListName || uploadedContacts.filter(c => c.selected).length === 0}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Create List ({uploadedContacts.filter(c => c.selected).length} contacts)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>Create SMS Campaign</DialogTitle>
                <DialogDescription>
                  Step {campaignStep} of 3: {campaignStep === 1 ? 'Campaign Details' : campaignStep === 2 ? 'Message Content' : 'Select Recipients'}
                </DialogDescription>
              </DialogHeader>

              {/* Step indicators */}
              <div className="flex items-center justify-center space-x-2 py-4">
                {[1, 2, 3].map((step) => (
                  <React.Fragment key={step}>
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        step <= campaignStep 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 3 && (
                      <ChevronRight className={`h-4 w-4 ${step < campaignStep ? 'text-blue-600' : 'text-gray-300'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-1" style={{ maxHeight: 'calc(90vh - 250px)' }}>
                <div className="space-y-4 py-4 pr-2">
                  {/* Step 1: Campaign Details */}
                  {campaignStep === 1 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="campaignName">Campaign Name *</Label>
                      <Input
                        id="campaignName"
                        placeholder="e.g., January Promotion"
                        value={newCampaign.name}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaignDesc">Description</Label>
                      <Input
                        id="campaignDesc"
                        placeholder="Optional description"
                        value={newCampaign.description}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    {/* From Number - Multi-select like Twilio */}
                    <div className="space-y-2">
                      <Label>From Numbers * (Twilio & Commio Only)</Label>
                      <p className="text-xs text-muted-foreground">
                        Only Twilio and Commio numbers can send SMS messages
                      </p>
                      
                      {/* Provider Filter */}
                      {phoneNumbers.length > 0 && (
                        <div className="flex gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => setProviderFilter('all')}
                            className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                              providerFilter === 'all' ? 'bg-gray-100 border-gray-300 text-gray-900' : 'hover:bg-gray-50'
                            }`}
                          >
                            All Providers
                          </button>
                          <button
                            type="button"
                            onClick={() => setProviderFilter('commio')}
                            className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                              providerFilter === 'commio' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'hover:bg-gray-50'
                            }`}
                          >
                            All Commio
                          </button>
                          <button
                            type="button"
                            onClick={() => setProviderFilter('twilio')}
                            className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                              providerFilter === 'twilio' ? 'bg-red-50 border-red-300 text-red-700' : 'hover:bg-gray-50'
                            }`}
                          >
                            All Twilio
                          </button>
                        </div>
                      )}
                      
                      {phoneNumbers.length === 0 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                          <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                          <p className="text-sm font-medium text-yellow-900 mb-1">No SMS-capable numbers available</p>
                          <p className="text-xs text-yellow-700">
                            Please add a Twilio or Commio account with phone numbers to send SMS campaigns.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Number Selection Mode */}
                          <div className="flex gap-2 mb-3">
                            <button
                              type="button"
                              onClick={() => setNumberSelectionMode('all')}
                              className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                numberSelectionMode === 'all' ? 'bg-green-50 border-green-300 text-green-700' : 'hover:bg-gray-50'
                              }`}
                            >
                              <RefreshCw className="h-3 w-3 inline mr-1" />
                              Use All ({filteredNumbers.length})
                            </button>
                        <button
                          type="button"
                          onClick={() => setNumberSelectionMode('select')}
                          className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                            numberSelectionMode === 'select' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
                          }`}
                        >
                          <CheckSquare className="h-3 w-3 inline mr-1" />
                          Select Multiple
                        </button>
                        <button
                          type="button"
                          onClick={() => setNumberSelectionMode('single')}
                          className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                            numberSelectionMode === 'single' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'hover:bg-gray-50'
                          }`}
                        >
                          <Hash className="h-3 w-3 inline mr-1" />
                          Single Number
                        </button>
                      </div>

                      {/* All Numbers Mode */}
                      {numberSelectionMode === 'all' && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <RefreshCw className="h-4 w-4 text-green-600" />
                            <span className="font-medium text-green-800 text-sm">All Numbers Pool Active</span>
                          </div>
                          <p className="text-xs text-green-700 mb-2">
                            Messages will rotate across all {filteredNumbers.length} numbers (2000 msgs/number max).
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const counts = filteredNumbers.reduce((acc: Record<string, number>, pn) => {
                                const provider = pn.provider || 'Unknown';
                                acc[provider] = (acc[provider] || 0) + 1;
                                return acc;
                              }, {});
                              return Object.entries(counts).map(([provider, count]) => (
                                <Badge key={provider} variant="outline" className="text-xs">
                                  {provider}: {count}
                                </Badge>
                              ));
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Multi-Select Mode */}
                      {numberSelectionMode === 'select' && (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                            <span className="text-xs font-semibold text-gray-700">
                              {selectedFromNumbers.size} selected
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedFromNumbers.size === filteredNumbers.length) {
                                  setSelectedFromNumbers(new Set());
                                } else {
                                  setSelectedFromNumbers(new Set(filteredNumbers.map(pn => pn.phoneNumber)));
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                            >
                              {selectedFromNumbers.size === filteredNumbers.length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          <div className="max-h-[200px] overflow-y-auto p-2">
                            <div className="space-y-1">
                              {filteredNumbers.map((pn, idx) => (
                                <label 
                                  key={idx} 
                                  className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                                    selectedFromNumbers.has(pn.phoneNumber) 
                                      ? 'bg-blue-50 border border-blue-200' 
                                      : 'hover:bg-gray-50 border border-transparent'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedFromNumbers.has(pn.phoneNumber)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedFromNumbers);
                                      if (e.target.checked) {
                                        newSet.add(pn.phoneNumber);
                                      } else {
                                        newSet.delete(pn.phoneNumber);
                                      }
                                      setSelectedFromNumbers(newSet);
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="flex-1 text-sm font-medium text-gray-900">{pn.phoneNumber}</span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs font-semibold ${
                                      pn.provider === 'commio' 
                                        ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                        : 'bg-red-50 text-red-700 border-red-200'
                                    }`}
                                  >
                                    {pn.provider}
                                  </Badge>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Single Number Mode */}
                      {numberSelectionMode === 'single' && (
                        <Select 
                          value={newCampaign.fromNumber}
                          onValueChange={(value) => {
                            const selectedPhone = filteredNumbers.find(pn => pn.phoneNumber === value);
                            setNewCampaign(prev => ({ 
                              ...prev, 
                              fromNumber: value,
                              fromAccountId: selectedPhone?.accountId || currentAccount?.id || ''
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a phone number" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredNumbers.map((pn, idx) => (
                              <SelectItem key={`${pn.phoneNumber}-${idx}`} value={pn.phoneNumber}>
                                <div className="flex items-center gap-2">
                                  <span>{pn.phoneNumber}</span>
                                  {pn.provider && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{pn.provider}</span>}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                        </>
                      )}
                    </div>
                    
                    {/* Drip Mode Settings */}
                    <div className="space-y-3 border-t pt-5 mt-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Drip Mode (Safe Sending)</Label>
                          <p className="text-xs text-gray-600 mt-1">
                            Spread messages over time to avoid carrier filtering
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDripMode(!dripMode)}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                            dripMode ? 'bg-green-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                              dripMode ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      
                      {dripMode && (
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 space-y-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                              <Zap className="h-5 w-5 text-green-700" />
                            </div>
                            <div className="flex-1">
                              <Label className="text-sm font-semibold text-green-900">Messages Per Minute (Per Number)</Label>
                              <p className="text-xs text-green-700 mt-1 mb-3">
                                Safe rate: 20-60 msgs/min. Lower = safer for new numbers.
                              </p>
                              <div className="flex items-center gap-4">
                                <input
                                  type="range"
                                  min="10"
                                  max="120"
                                  step="10"
                                  value={messagesPerMinute}
                                  onChange={(e) => setMessagesPerMinute(parseInt(e.target.value))}
                                  className="flex-1 h-2 bg-green-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                                />
                                <Input
                                  type="number"
                                  min="10"
                                  max="120"
                                  value={messagesPerMinute}
                                  onChange={(e) => setMessagesPerMinute(parseInt(e.target.value) || 30)}
                                  className="w-20 text-center font-semibold border-green-300 focus:border-green-500 focus:ring-green-500"
                                />
                              </div>
                              <div className="flex items-center justify-between mt-3 text-xs">
                                <span className="font-medium text-green-800">
                                  {messagesPerMinute <= 30 ? '🟢 Very Safe' : messagesPerMinute <= 60 ? '🟡 Safe' : '🟠 Moderate'}
                                </span>
                                <span className="text-green-800 font-semibold">
                                  {messagesPerMinute} msgs/min
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded-lg p-4 text-xs space-y-2 shadow-sm border border-green-100">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Delay between messages:</span>
                              <span className="font-medium">{(60 / messagesPerMinute).toFixed(1)}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Est. time for 1000 msgs:</span>
                              <span className="font-medium">{Math.ceil(1000 / messagesPerMinute)} minutes</span>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2 text-xs text-green-800 bg-green-100 rounded-lg p-3 border border-green-200">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div>
                              <strong className="font-semibold">Best Practices:</strong> Keep opt-out rate &lt;1%, error rate &lt;6%. 
                              Include opt-out language and sender ID in messages.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Step 2: Message Content */}
                {campaignStep === 2 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="messageTemplate">Message Template *</Label>
                      <Textarea
                        id="messageTemplate"
                        placeholder="Hi {first_name}, quick update - we finalized details on an option around ${dollar_amount}. Please call me back here as soon as you can. (857) 800-8971"
                        className="min-h-[150px]"
                        value={newCampaign.messageTemplate}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, messageTemplate: e.target.value }))}
                      />
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                        <p className="text-xs font-medium text-blue-900 mb-2">Available Merge Tags:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{first_name}'}</code>
                            <span className="text-blue-600">or</span>
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{{firstName}}'}</code>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{last_name}'}</code>
                            <span className="text-blue-600">or</span>
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{{lastName}}'}</code>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{phone}'}</code>
                            <span className="text-blue-600">or</span>
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{{phone}}'}</code>
                          </div>
                          <div className="flex items-center gap-1">
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{name}'}</code>
                            <span className="text-blue-600">or</span>
                            <code className="bg-white px-1.5 py-0.5 rounded text-blue-700">{'{{name}}'}</code>
                          </div>
                        </div>
                        <p className="text-xs text-blue-700 mt-2">
                          💡 You can also use custom fields from your CSV: <code className="bg-white px-1.5 py-0.5 rounded">{'{dollar_amount}'}</code>, <code className="bg-white px-1.5 py-0.5 rounded">{'{company}'}</code>, etc.
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <Label className="text-sm font-medium">Preview</Label>
                      <div className="mt-2 p-3 bg-white rounded border text-sm">
                        {newCampaign.messageTemplate
                          .replace(/\{\{firstName\}\}/g, 'John')
                          .replace(/\{first_name\}/g, 'John')
                          .replace(/\{\{lastName\}\}/g, 'Doe')
                          .replace(/\{last_name\}/g, 'Doe')
                          .replace(/\{\{phoneNumber\}\}/g, '+1234567890')
                          .replace(/\{phone_number\}/g, '+1234567890')
                          .replace(/\{phone\}/g, '+1234567890')
                          .replace(/\{dollar_amount\}/g, '$50,000')
                          .replace(/\{company\}/g, 'Acme Corp')
                          || 'Your message preview will appear here...'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {newCampaign.messageTemplate.length} characters
                        {newCampaign.messageTemplate.length > 160 && ` (${Math.ceil(newCampaign.messageTemplate.length / 160)} segments)`}
                      </p>
                    </div>
                  </>
                )}

                {/* Step 3: Select Recipients */}
                {campaignStep === 3 && (
                  <>
                    <div className="space-y-2">
                      <Label>Select Contact List *</Label>
                      <Select 
                        value={newCampaign.contactListId}
                        onValueChange={(value) => setNewCampaign(prev => ({ ...prev, contactListId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a contact list" />
                        </SelectTrigger>
                        <SelectContent>
                          {contactLists.length === 0 ? (
                            <SelectItem value="_none" disabled>No contact lists available</SelectItem>
                          ) : (
                            contactLists.map((list) => (
                              <SelectItem key={list.id} value={String(list.id)}>
                                {list.name} ({list.contactCount || 0} contacts)
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {contactLists.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No contact lists yet</p>
                        <Button 
                          variant="link" 
                          onClick={() => {
                            setShowNewCampaign(false);
                            setShowNewList(true);
                          }}
                        >
                          Import contacts first
                        </Button>
                      </div>
                    )}

                    {/* Campaign Summary */}
                    {newCampaign.contactListId && (
                      <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                        <h4 className="font-medium text-blue-900">Campaign Summary</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-blue-700">Campaign Name:</div>
                          <div className="text-blue-900 font-medium">{newCampaign.name}</div>
                          <div className="text-blue-700">From Number:</div>
                          <div className="text-blue-900 font-medium">{newCampaign.fromNumber}</div>
                          <div className="text-blue-700">Recipients:</div>
                          <div className="text-blue-900 font-medium">
                            {contactLists.find(l => String(l.id) === newCampaign.contactListId)?.contactCount || 0} contacts
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>

              <DialogFooter className="flex-shrink-0">
                {campaignStep > 1 && (
                  <Button variant="outline" onClick={() => setCampaignStep(prev => prev - 1)}>
                    Back
                  </Button>
                )}
                {campaignStep < 3 ? (
                  <Button 
                    onClick={() => setCampaignStep(prev => prev + 1)}
                    disabled={
                      (campaignStep === 1 && (
                        !newCampaign.name || 
                        (numberSelectionMode === 'single' && !newCampaign.fromNumber) ||
                        (numberSelectionMode === 'select' && selectedFromNumbers.size === 0) ||
                        (numberSelectionMode === 'all' && filteredNumbers.length === 0)
                      )) ||
                      (campaignStep === 2 && !newCampaign.messageTemplate)
                    }
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCreateCampaign}
                    disabled={!newCampaign.contactListId}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Create Campaign
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <Send className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSent.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deliveryRate}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="campaigns">
            <MessageSquare className="mr-2 h-4 w-4" />
            Campaigns ({campaigns.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <Users className="mr-2 h-4 w-4" />
            Contact Lists ({contactLists.length})
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-4">
          {/* Sending Progress */}
          {showProgress && (
            <Card className="mb-4 border-blue-200 bg-blue-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-blue-800">Sending Messages...</span>
                  <span className="text-sm text-blue-600">
                    {sendingProgress.sent + sendingProgress.failed} / {sendingProgress.total}
                  </span>
                </div>
                <Progress 
                  value={sendingProgress.total > 0 ? ((sendingProgress.sent + sendingProgress.failed) / sendingProgress.total) * 100 : 0} 
                  className="h-3"
                />
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-green-600">✓ Sent: {sendingProgress.sent}</span>
                  <span className="text-red-600">✗ Failed: {sendingProgress.failed}</span>
                  <span className="text-blue-600">Using {numberSelectionMode === 'all' ? phoneNumbers.length : numberSelectionMode === 'select' ? selectedFromNumbers.size : 1} numbers in parallel</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>SMS Campaigns</CardTitle>
              <CardDescription>Manage your SMS marketing campaigns with parallel batch sending</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first SMS campaign to start reaching your audience
                  </p>
                  <Button onClick={() => setShowNewCampaign(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Campaign
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Failed</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{campaign.name}</div>
                              {campaign.description && (
                                <div className="text-xs text-muted-foreground">{campaign.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                          <TableCell>{campaign.recipientCount?.toLocaleString() || 0}</TableCell>
                          <TableCell>{campaign.sentCount?.toLocaleString() || 0}</TableCell>
                          <TableCell className="text-green-600">{campaign.deliveredCount?.toLocaleString() || 0}</TableCell>
                          <TableCell className="text-red-600">{campaign.failedCount?.toLocaleString() || 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(campaign.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              {campaign.status === 'draft' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleStartCampaign(campaign.id, campaign)}
                                  disabled={isSending}
                                  title="Start campaign with parallel batch sending"
                                >
                                  <Play className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {campaign.status === 'sending' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handlePauseCampaign(campaign.id)}
                                >
                                  <Pause className="h-4 w-4 text-yellow-600" />
                                </Button>
                              )}
                              {campaign.status === 'paused' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleStartCampaign(campaign.id, campaign)}
                                  disabled={isSending}
                                  title="Resume campaign with parallel batch sending"
                                >
                                  <Play className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuItem>
                                    <BarChart3 className="mr-2 h-4 w-4" />
                                    View Stats
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    View Message
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Lists Tab */}
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contact Lists</CardTitle>
                  <CardDescription>Manage your contact lists for campaigns</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowNewList(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Contacts
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contactLists.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No contact lists yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Import your contacts from a CSV file to get started
                  </p>
                  <Button onClick={() => setShowNewList(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import Contacts
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {contactLists.map((list) => (
                    <Card key={list.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{list.name}</CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Contacts</DropdownMenuItem>
                              <DropdownMenuItem>Edit List</DropdownMenuItem>
                              <DropdownMenuItem>Export CSV</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => handleDeleteList(list.id, list.name)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {list.description && (
                          <CardDescription>{list.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-muted-foreground">
                            <Users className="h-4 w-4 mr-2" />
                            <span className="text-2xl font-bold text-foreground">{list.contactCount}</span>
                            <span className="ml-1">contacts</span>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setNewCampaign(prev => ({ ...prev, contactListId: String(list.id) }));
                              setCampaignStep(3);
                              setShowNewCampaign(true);
                            }}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Send Campaign
                          </Button>
                        </div>
                      </CardContent>
                      <CardFooter className="text-xs text-muted-foreground pt-0">
                        Created {new Date(list.createdAt).toLocaleDateString()}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
