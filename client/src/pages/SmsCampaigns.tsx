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
  CheckSquare,
  Save,
  FileText,
  Edit,
  Copy,
  Download,
  Eye
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
import ContactImportMapper from '@/components/ContactImportMapper';

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
  recipientLimit?: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  optOutCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  // New campaign mode fields
  sendMode?: string;
  dripMessagesPerMinute?: number;
  dripConcurrentPerNumber?: number;
  timezoneSchedulingEnabled?: boolean;
  forwardNumberOverride?: string;
  filterChannelsEnabled?: boolean;
  disableClaimsEnabled?: boolean;
  optOutMessageEnabled?: boolean;
  optOutMessageText?: string;
  autoResponseEnabled?: boolean;
  autoResponseMessage?: string;
  autoResponseKeywords?: string[];
  responseCount?: number;
  linkClickCount?: number;
  invalidNumberCount?: number;
  spamReportCount?: number;
  isArchived?: boolean;
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

interface MessageTemplate {
  id: number;
  name: string;
  content: string;
  description?: string;
  category?: string;
  usageCount: number;
  createdAt: string;
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
    customVariables: {} as Record<string, string>, // Custom variable default values
  });
  
  // Send mode: 'immediate', 'scheduled', 'drip'
  const [sendMode, setSendMode] = useState<'immediate' | 'scheduled' | 'drip'>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduledTimezone, setScheduledTimezone] = useState('America/New_York');
  
  // Campaign options
  const [forwardNumberOverride, setForwardNumberOverride] = useState('');
  const [filterChannelsEnabled, setFilterChannelsEnabled] = useState(false);
  const [disableClaimsEnabled, setDisableClaimsEnabled] = useState(false);
  const [optOutMessageEnabled, setOptOutMessageEnabled] = useState(false);
  const [optOutMessageText, setOptOutMessageText] = useState('Reply STOP to Opt-Out');
  const [timezoneSchedulingEnabled, setTimezoneSchedulingEnabled] = useState(false);
  
  // Automated response
  const [autoResponseEnabled, setAutoResponseEnabled] = useState(false);
  const [autoResponseMessage, setAutoResponseMessage] = useState('');
  const [autoResponseKeywords, setAutoResponseKeywords] = useState('');
  
  // Test message
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testMessagePreview, setTestMessagePreview] = useState('');
  
  // Campaign detail view
  const [viewingCampaignDetail, setViewingCampaignDetail] = useState<SmsCampaign | null>(null);
  
  // Multi-select phone numbers for batch sending (Twilio-style)
  const [numberSelectionMode, setNumberSelectionMode] = useState<'all' | 'select' | 'single'>('all');
  const [selectedFromNumbers, setSelectedFromNumbers] = useState<Set<string>>(new Set());
  
  // Multi-campaign progress tracking: campaignId -> progress data
  const [activeProgressMap, setActiveProgressMap] = useState<Record<number, { sent: number; failed: number; total: number; status: 'sending' | 'completed' | 'paused' }>>({});
  const pollingCampaignsRef = React.useRef<Set<number>>(new Set());
  
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
  
  // Message template textarea ref for cursor position
  const messageTemplateRef = React.useRef<HTMLTextAreaElement>(null);
  
  // Message templates
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '', description: '', category: '' });
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  
  // Contact list management
  const [viewingList, setViewingList] = useState<{ id: number; name: string; contacts: any[] } | null>(null);
  const [editingList, setEditingList] = useState<{ id: number; name: string; description: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedListCustomFields, setSelectedListCustomFields] = useState<string[]>([]);

  // Filter phone numbers by provider (memoized to prevent infinite loops)
  const filteredNumbers = useMemo(() => {
    if (providerFilter === 'all') return phoneNumbers;
    return phoneNumbers.filter(pn => pn.provider === providerFilter);
  }, [phoneNumbers, providerFilter]);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, [currentAccount]);

  // Helper: start polling progress for a campaign
  const startPollingCampaign = useCallback((campaignId: number, initialProgress?: { sent: number; failed: number; total: number }) => {
    if (pollingCampaignsRef.current.has(campaignId)) return; // Already polling
    pollingCampaignsRef.current.add(campaignId);

    // Set initial progress
    setActiveProgressMap(prev => ({
      ...prev,
      [campaignId]: { sent: initialProgress?.sent || 0, failed: initialProgress?.failed || 0, total: initialProgress?.total || 0, status: 'sending' },
    }));

    const pollProgress = async () => {
      try {
        const progressRes = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/progress`, {
          credentials: 'include',
        });
        if (progressRes.ok) {
          const progress = await progressRes.json();
          const isFinished = progress.status === 'completed' || progress.status === 'paused';

          setActiveProgressMap(prev => ({
            ...prev,
            [campaignId]: { sent: progress.sent, failed: progress.failed, total: progress.total, status: isFinished ? progress.status : 'sending' },
          }));

          if (isFinished) {
            pollingCampaignsRef.current.delete(campaignId);
            // Remove from progress map after 5 seconds (no auto-refresh)
            setTimeout(() => {
              setActiveProgressMap(prev => {
                const next = { ...prev };
                delete next[campaignId];
                return next;
              });
              // No fetchData() - user can manually refresh if needed
            }, 5000);
            return;
          }
          setTimeout(pollProgress, 5000); // Poll every 5 seconds instead of 2
        } else {
          setTimeout(pollProgress, 5000);
        }
      } catch (err) {
        console.error(`Error polling progress for campaign ${campaignId}:`, err);
        setTimeout(pollProgress, 5000);
      }
    };
    pollProgress();
  }, []);

  // Resume polling for ALL active sending campaigns on mount / when campaigns change
  useEffect(() => {
    const activeSending = campaigns.filter(c => c.status === 'sending');
    for (const campaign of activeSending) {
      startPollingCampaign(campaign.id, {
        sent: campaign.sentCount || 0,
        failed: campaign.failedCount || 0,
        total: campaign.recipientCount || 0,
      });
    }
  }, [campaigns, startPollingCampaign]);

  // Auto-clear completed campaigns from progress map
  // Immediately remove campaigns over 100%, short delay for exactly 100%
  // NO AUTO-REFRESH - let user manually refresh if needed
  useEffect(() => {
    const immediateRemoveIds: number[] = [];
    const delayedRemoveIds: number[] = [];
    
    for (const [idStr, prog] of Object.entries(activeProgressMap)) {
      const pct = prog.total > 0 ? ((prog.sent + prog.failed) / prog.total) * 100 : 0;
      if (pct > 100) {
        // Over 100% - remove immediately (like campaign #13 at 184%)
        immediateRemoveIds.push(Number(idStr));
      } else if (pct >= 100 || prog.status === 'completed') {
        // Exactly 100% - short delay to show completion
        delayedRemoveIds.push(Number(idStr));
      }
    }
    
    // Immediately remove over-100% campaigns (no refresh)
    if (immediateRemoveIds.length > 0) {
      setActiveProgressMap(prev => {
        const next = { ...prev };
        for (const id of immediateRemoveIds) {
          delete next[id];
        }
        return next;
      });
      // Removed fetchData() - no auto-refresh
    }
    
    // Delayed removal for exactly 100% campaigns (no refresh)
    if (delayedRemoveIds.length > 0) {
      const timer = setTimeout(() => {
        setActiveProgressMap(prev => {
          const next = { ...prev };
          for (const id of delayedRemoveIds) {
            const prog = next[id];
            if (prog) {
              const pct = prog.total > 0 ? ((prog.sent + prog.failed) / prog.total) * 100 : 0;
              if (pct >= 100 || prog.status === 'completed') {
                delete next[id];
              }
            }
          }
          return next;
        });
        // Removed fetchData() - no auto-refresh
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [activeProgressMap]);

  // Fetch custom fields when campaign dialog opens or contact list changes
  useEffect(() => {
    const fetchCustomFields = async () => {
      // If a specific contact list is selected, fetch from that list
      if (newCampaign.contactListId) {
        try {
          const res = await fetch(`/api/campaigns/contact-lists/${newCampaign.contactListId}/contacts?limit=100`, {
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            const customFieldKeys = new Set<string>();
            
            (data.contacts || []).forEach((contact: any) => {
              if (contact.customFields) {
                Object.keys(contact.customFields).forEach(key => {
                  if (!key.includes('middle') && !key.includes('midl') && key !== 'stdaddr_midlnm') {
                    customFieldKeys.add(key);
                  }
                });
              }
            });
            
            setSelectedListCustomFields(Array.from(customFieldKeys));
            return;
          }
        } catch (error) {
          console.error('Failed to fetch custom fields:', error);
        }
      }
      
      // If no contact list selected but dialog is open, fetch from all lists to show available fields
      if (showNewCampaign && contactLists.length > 0) {
        try {
          const customFieldKeys = new Set<string>();
          
          // Fetch from first few contact lists to detect available custom fields
          for (const list of contactLists.slice(0, 3)) {
            const res = await fetch(`/api/campaigns/contact-lists/${list.id}/contacts?limit=50`, {
              credentials: 'include'
            });
            if (res.ok) {
              const data = await res.json();
              (data.contacts || []).forEach((contact: any) => {
                if (contact.customFields) {
                  Object.keys(contact.customFields).forEach(key => {
                    if (!key.includes('middle') && !key.includes('midl') && key !== 'stdaddr_midlnm') {
                      customFieldKeys.add(key);
                    }
                  });
                }
              });
            }
          }
          
          setSelectedListCustomFields(Array.from(customFieldKeys));
        } catch (error) {
          console.error('Failed to fetch custom fields:', error);
        }
      } else if (!showNewCampaign) {
        setSelectedListCustomFields([]);
      }
    };
    
    fetchCustomFields();
  }, [newCampaign.contactListId, showNewCampaign, contactLists]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const accountId = currentAccount?.id ? parseInt(String(currentAccount.id).replace('acc_', '')) : undefined;
      
      // Fetch campaigns, contact lists, and accounts in parallel
      const [campaignsRes, listsRes, accountsRes] = await Promise.all([
        fetch(`/api/campaigns/sms-campaigns${accountId ? `?accountId=${accountId}` : ''}`, {
          credentials: 'include'
        }),
        fetch(`/api/campaigns/contact-lists${accountId ? `?accountId=${accountId}` : ''}`, {
          credentials: 'include'
        }),
        fetch('/api/accounts', { credentials: 'include' })
      ]);
      
      // Fetch message templates separately (non-blocking, may not exist yet)
      fetch('/api/message-templates', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.templates) {
            setMessageTemplates(data.templates);
          }
        })
        .catch(() => {
          // Templates table may not exist yet - ignore silently
        });

      // Process campaigns
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        console.log('[SmsCampaigns] Campaigns fetched:', data);
        setCampaigns(data.campaigns || []);
      } else {
        console.error('[SmsCampaigns] Failed to fetch campaigns:', campaignsRes.status);
      }

      // Process contact lists
      if (listsRes.ok) {
        const data = await listsRes.json();
        console.log('[SmsCampaigns] Contact lists fetched:', data);
        setContactLists(data.lists || []);
      } else {
        console.error('[SmsCampaigns] Failed to fetch contact lists:', listsRes.status);
      }

      // Process phone numbers
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const smsAccounts = (accountsData.accounts || []).filter(
          (acc: any) => acc.provider === 'twilio' || acc.provider === 'commio'
        );

        if (currentAccount?.id) {
          // Single account mode
          const account = smsAccounts.find((acc: any) => acc.id === currentAccount.id);
          if (account) {
            const phonesRes = await fetch(`/api/accounts/${currentAccount.id}/phone-numbers`, {
              credentials: 'include'
            });
            if (phonesRes.ok) {
              const data = await phonesRes.json();
              setPhoneNumbers(data.phoneNumbers || []);
            }
          } else {
            setPhoneNumbers([]);
          }
        } else {
          // All accounts mode - fetch phone numbers in parallel
          const phonePromises = smsAccounts.map(async (acc: any) => {
            try {
              const phonesRes = await fetch(`/api/accounts/${acc.id}/phone-numbers`, {
                credentials: 'include'
              });
              if (phonesRes.ok) {
                const data = await phonesRes.json();
                return (data.phoneNumbers || []).map((pn: any) => ({
                  ...pn,
                  accountId: acc.id,
                  accountName: acc.name,
                  provider: acc.provider
                }));
              }
            } catch (e) {
              console.error(`Failed to fetch phone numbers for account ${acc.id}:`, e);
            }
            return [];
          });

          const phoneNumberArrays = await Promise.all(phonePromises);
          const allPhoneNumbers = phoneNumberArrays.flat();
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
        // Build custom fields object for non-standard columns
        // Exclude middle name fields (stdAddr_midlNm, middle_name, middlename, etc.)
        const customFields: Record<string, string> = {};
        headers.forEach((header, index) => {
          if (index !== phoneIndex && index !== firstNameIndex && 
              index !== lastNameIndex && index !== emailIndex && values[index]) {
            // Convert header to snake_case for consistency
            const fieldName = header.replace(/\s+/g, '_').toLowerCase();
            // Skip middle name fields
            if (fieldName.includes('middle') || fieldName.includes('midl') || fieldName === 'stdaddr_midlnm') {
              return;
            }
            customFields[fieldName] = values[index];
          }
        });

        // Build contact object with all fields
        const contact: any = {
          phoneNumber: values[phoneIndex],
          firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
          lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
          email: emailIndex >= 0 ? values[emailIndex] : undefined,
          selected: true,
          customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
          // Also spread custom fields for UI display and merge tag detection
          ...customFields,
        };

        contacts.push(contact);
      }
    }
    return contacts;
  };

  // Handle file upload - parse and show preview
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('[Upload] Starting file upload:', file.name, 'Size:', file.size);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // For small files (<5MB), parse and show preview
      if (file.size <= 5 * 1024 * 1024) {
        console.log('[Upload] Small file - parsing all contacts');
        const text = await file.text();
        setUploadProgress(30);
        
        const contacts = parseCSV(text);
        console.log('[Upload] Parsed contacts:', contacts.length);
        setUploadProgress(70);
        
        setUploadedContacts(contacts);
        console.log('[Upload] Set uploadedContacts state');
        setUploadProgress(100);
        
        toast({
          title: 'File Uploaded',
          description: `Found ${contacts.length} contacts in the file`,
        });
      } else {
        // For large files (>5MB), show preview of first 1000 contacts
        console.log('[Upload] Large file - parsing preview');
        const contacts = await parseLargeFilePreview(file);
        console.log('[Upload] Parsed preview contacts:', contacts.length);
        setUploadedContacts(contacts);
        console.log('[Upload] Set uploadedContacts state');
        setUploadProgress(100);
        
        toast({
          title: 'File Uploaded',
          description: `Large file detected. Showing preview of ${contacts.length} contacts. Full import will happen when you create the list.`,
        });
      }
    } catch (error) {
      console.error('[Upload] Error parsing file:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to parse the CSV file',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Parse large file preview (first 1000 contacts)
  const parseLargeFilePreview = async (file: File): Promise<Contact[]> => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let lineNumber = 0;
    let headers: string[] = [];
    const contacts: Contact[] = [];
    const MAX_PREVIEW = 1000;

    try {
      while (contacts.length < MAX_PREVIEW) {
        const { done, value } = await reader.read();
        
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            if (lineNumber === 0) {
              headers = parseCSVLine(line).map(h => h.toLowerCase().trim());
              lineNumber++;
              continue;
            }
            
            const values = parseCSVLine(line);
            const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));
            
            if (phoneIndex >= 0 && values[phoneIndex]) {
              const firstNameIndex = headers.findIndex(h => h.includes('first') || h === 'name');
              const lastNameIndex = headers.findIndex(h => h.includes('last'));
              const emailIndex = headers.findIndex(h => h.includes('email'));
              
              // Build custom fields object (exclude middle name fields)
              const customFields: Record<string, string> = {};
              headers.forEach((header, index) => {
                if (index !== phoneIndex && index !== firstNameIndex && 
                    index !== lastNameIndex && index !== emailIndex && values[index]) {
                  const fieldName = header.replace(/\s+/g, '_').toLowerCase();
                  // Skip middle name fields
                  if (fieldName.includes('middle') || fieldName.includes('midl') || fieldName === 'stdaddr_midlnm') {
                    return;
                  }
                  customFields[fieldName] = values[index];
                }
              });
              
              const contact: any = {
                phoneNumber: values[phoneIndex],
                firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
                lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
                email: emailIndex >= 0 ? values[emailIndex] : undefined,
                selected: true,
                customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
                ...customFields,
              };
              
              contacts.push(contact);
              
              if (contacts.length >= MAX_PREVIEW) break;
            }
            
            lineNumber++;
          }
        }
        
        if (done) break;
      }
      
      reader.cancel();
      return contacts;
    } catch (error) {
      console.error('Error parsing preview:', error);
      throw error;
    }
  };

  // Handle large file upload with streaming and immediate chunked import
  const handleLargeFileStreamingImport = async (file: File, contactListId: number, accountId?: number) => {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let lineNumber = 0;
    let headers: string[] = [];
    let contactBatch: Contact[] = [];
    let processedBytes = 0;
    let totalContacts = 0;
    const BATCH_SIZE = 500; // Process and import 500 contacts at a time

    // Function to import a batch of contacts
    const importBatch = async (contacts: Contact[]) => {
      if (contacts.length === 0) return;
      
      const importRes = await fetch('/api/campaigns/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId,
          contactListId,
          contacts,
        }),
      });

      if (!importRes.ok) {
        throw new Error('Failed to import contact batch');
      }
      
      const importData = await importRes.json();
      totalContacts += importData.imported || 0;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (value) {
          processedBytes += value.length;
          buffer += decoder.decode(value, { stream: !done });
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            if (lineNumber === 0) {
              // Parse headers
              headers = parseCSVLine(line).map(h => h.toLowerCase().trim());
              lineNumber++;
              continue;
            }
            
            // Parse contact
            const values = parseCSVLine(line);
            const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));
            
            if (phoneIndex >= 0 && values[phoneIndex]) {
              const firstNameIndex = headers.findIndex(h => h.includes('first') || h === 'name');
              const lastNameIndex = headers.findIndex(h => h.includes('last'));
              const emailIndex = headers.findIndex(h => h.includes('email'));
              
              // Build custom fields object (exclude middle name fields)
              const customFields: Record<string, string> = {};
              headers.forEach((header, index) => {
                if (index !== phoneIndex && index !== firstNameIndex && 
                    index !== lastNameIndex && index !== emailIndex && values[index]) {
                  const fieldName = header.replace(/\s+/g, '_').toLowerCase();
                  // Skip middle name fields
                  if (fieldName.includes('middle') || fieldName.includes('midl') || fieldName === 'stdaddr_midlnm') {
                    return;
                  }
                  customFields[fieldName] = values[index];
                }
              });
              
              const contact: any = {
                phoneNumber: values[phoneIndex],
                firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
                lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
                email: emailIndex >= 0 ? values[emailIndex] : undefined,
                selected: true,
                customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
                ...customFields,
              };
              
              contactBatch.push(contact);
              
              // Import batch when it reaches BATCH_SIZE
              if (contactBatch.length >= BATCH_SIZE) {
                await importBatch(contactBatch);
                contactBatch = [];
              }
            }
            
            lineNumber++;
          }
          
          // Update progress
          const progress = Math.min(90, (processedBytes / file.size) * 90);
          setUploadProgress(progress);
        }
        
        if (done) {
          // Process any remaining line in buffer
          if (buffer.trim() && headers.length > 0) {
            const values = parseCSVLine(buffer);
            const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));
            
            if (phoneIndex >= 0 && values[phoneIndex]) {
              const firstNameIndex = headers.findIndex(h => h.includes('first') || h === 'name');
              const lastNameIndex = headers.findIndex(h => h.includes('last'));
              const emailIndex = headers.findIndex(h => h.includes('email'));
              
              // Build custom fields object (exclude middle name fields)
              const customFields: Record<string, string> = {};
              headers.forEach((header, index) => {
                if (index !== phoneIndex && index !== firstNameIndex && 
                    index !== lastNameIndex && index !== emailIndex && values[index]) {
                  const fieldName = header.replace(/\s+/g, '_').toLowerCase();
                  // Skip middle name fields
                  if (fieldName.includes('middle') || fieldName.includes('midl') || fieldName === 'stdaddr_midlnm') {
                    return;
                  }
                  customFields[fieldName] = values[index];
                }
              });
              
              const contact: any = {
                phoneNumber: values[phoneIndex],
                firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
                lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
                email: emailIndex >= 0 ? values[emailIndex] : undefined,
                selected: true,
                customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
                ...customFields,
              };
              
              contactBatch.push(contact);
            }
          }
          
          // Import any remaining contacts in the batch
          if (contactBatch.length > 0) {
            await importBatch(contactBatch);
          }
          
          break;
        }
      }
      
      setUploadProgress(100);
      
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${totalContacts.toLocaleString()} contacts to "${newListName}"`,
      });
      
      // Reset and refresh
      setShowNewList(false);
      setNewListName('');
      setNewListDescription('');
      setUploadedContacts([]);
      setUploadProgress(0);
      fetchData();
      
    } catch (error) {
      console.error('Error streaming file:', error);
      throw error;
    }
  };

  // Delete campaign
  const handleDeleteCampaign = async (campaignId: number, campaignName: string) => {
    if (!confirm(`Are you sure you want to delete "${campaignName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/sms-campaigns/${campaignId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete campaign');
      }

      // Immediately update the UI by filtering out the deleted campaign
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));

      toast({
        title: 'Success',
        description: 'Campaign deleted successfully',
      });

      // Refresh data to ensure consistency
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete campaign',
        variant: 'destructive'
      });
    }
  };

  // Delete contact list
  const handleDeleteList = async (listId: number, listName: string) => {
    if (!confirm(`Are you sure you want to delete "${listName}"? This will also delete all contacts in this list.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/campaigns/contact-lists/${listId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Delete failed:', errorData);
        throw new Error(errorData.error || 'Failed to delete contact list');
      }

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Response is not JSON, content-type:', contentType);
        const text = await res.text();
        console.error('Response body:', text.substring(0, 200));
        throw new Error('Server returned invalid response format');
      }

      const result = await res.json();

      // Immediately update the UI by filtering out the deleted list
      setContactLists(prev => prev.filter(list => list.id !== listId));

      toast({
        title: 'Success',
        description: 'Contact list deleted successfully',
      });

      // Refresh data to ensure consistency
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

  // View contacts in a list
  const handleViewContacts = async (listId: number, listName: string) => {
    try {
      const res = await fetch(`/api/campaigns/contact-lists/${listId}/contacts`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setViewingList({ id: listId, name: listName, contacts: data.contacts || [] });
      } else {
        throw new Error('Failed to fetch contacts');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load contacts',
        variant: 'destructive'
      });
    }
  };

  // Edit contact list
  const handleEditList = async () => {
    if (!editingList) return;
    
    try {
      const res = await fetch(`/api/campaigns/contact-lists/${editingList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editingList.name,
          description: editingList.description
        })
      });
      
      if (res.ok) {
        setContactLists(prev => prev.map(list => 
          list.id === editingList.id 
            ? { ...list, name: editingList.name, description: editingList.description }
            : list
        ));
        setEditingList(null);
        toast({
          title: 'Success',
          description: 'Contact list updated successfully',
        });
      } else {
        throw new Error('Failed to update list');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update contact list',
        variant: 'destructive'
      });
    }
  };

  // Export contact list to CSV
  const handleExportCSV = async (listId: number, listName: string) => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/campaigns/contact-lists/${listId}/contacts`, {
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Failed to fetch contacts');
      
      const data = await res.json();
      const contacts = data.contacts || [];
      
      if (contacts.length === 0) {
        toast({
          title: 'No Contacts',
          description: 'This list has no contacts to export',
          variant: 'destructive'
        });
        return;
      }
      
      // Build CSV content - dynamically include custom fields
      const customFieldKeys = contacts.length > 0 && contacts[0].customFields 
        ? Object.keys(contacts[0].customFields) 
        : [];
      
      const headers = ['Phone Number', 'First Name', 'Last Name', 'Email', ...customFieldKeys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))];
      const csvRows = [headers.join(',')];
      
      contacts.forEach((contact: any) => {
        const row = [
          contact.phoneNumber || '',
          contact.firstName || '',
          contact.lastName || '',
          contact.email || '',
          ...customFieldKeys.map(key => contact.customFields?.[key] || '')
        ].map(field => `"${String(field).replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${listName.replace(/[^a-z0-9]/gi, '_')}_contacts.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Export Complete',
        description: `Exported ${contacts.length} contacts to CSV`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to export contacts',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle contact import from ContactImportMapper
  const handleContactImportComplete = async (contacts: any[]) => {
    if (!newListName) {
      toast({
        title: 'Missing List Name',
        description: 'Please provide a list name before importing',
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

      // Transform contacts to separate standard fields from custom fields
      const transformedContacts = contacts.map(contact => {
        const standardFields = ['phoneNumber', 'firstName', 'lastName', 'email', 'birthday', 'address', 'city', 'state', 'zipCode', 'country', 'source'];
        const customFields: Record<string, any> = {};
        
        // Separate custom fields from standard fields
        Object.keys(contact).forEach(key => {
          if (!standardFields.includes(key) && contact[key]) {
            customFields[key] = contact[key];
          }
        });
        
        return {
          phoneNumber: contact.phoneNumber,
          firstName: contact.firstName || null,
          lastName: contact.lastName || null,
          email: contact.email || null,
          customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        };
      });

      // Import contacts in chunks
      const chunkSize = 1000;
      let totalImported = 0;

      for (let i = 0; i < transformedContacts.length; i += chunkSize) {
        const chunk = transformedContacts.slice(i, i + chunkSize);
        
        const importRes = await fetch('/api/campaigns/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            accountId,
            contactListId: listData.id,
            contacts: chunk,
          }),
        });

        if (!importRes.ok) {
          throw new Error(`Failed to import contacts chunk ${Math.floor(i / chunkSize) + 1}`);
        }
        
        const importData = await importRes.json();
        totalImported += importData.imported || 0;
      }
      
      toast({
        title: 'Success',
        description: `Created list "${newListName}" with ${totalImported} contact${totalImported !== 1 ? 's' : ''}`,
      });

      // Reset and refresh
      setShowNewList(false);
      setNewListName('');
      setNewListDescription('');
      fetchData();
    } catch (error: any) {
      console.error('[Import] Error:', error);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import contacts',
        variant: 'destructive'
      });
    }
  };

  // Create contact list and import contacts (legacy - keeping for backward compatibility)
  const handleCreateListAndImport = async () => {
    console.log('[Import] Starting import - newListName:', newListName, 'uploadedContacts:', uploadedContacts.length);
    
    if (!newListName || uploadedContacts.length === 0) {
      console.log('[Import] Validation failed - newListName:', !!newListName, 'hasContacts:', uploadedContacts.length > 0);
      toast({
        title: 'Missing Information',
        description: !newListName ? 'Please provide a list name' : 'Please upload contacts first',
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

      const selectedContacts = uploadedContacts.filter(c => c.selected);
      
      // Check if we need streaming import for large files
      const uploadedFile = (document.querySelector('input[type="file"]') as HTMLInputElement)?.files?.[0];
      
      if (uploadedFile && uploadedFile.size > 5 * 1024 * 1024) {
        // Large file - use streaming import
        await handleLargeFileStreamingImport(uploadedFile, listData.id, accountId);
        
        toast({
          title: 'Success',
          description: `Created list "${newListName}" and imported all contacts from large file`,
        });
      } else {
        // Small file or preview - use chunked import
        const chunkSize = 1000;
        let totalImported = 0;

        for (let i = 0; i < selectedContacts.length; i += chunkSize) {
          const chunk = selectedContacts.slice(i, i + chunkSize);
          
          const importRes = await fetch('/api/campaigns/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              accountId,
              contactListId: listData.id,
              contacts: chunk,
            }),
          });

          if (!importRes.ok) {
            throw new Error(`Failed to import contacts chunk ${Math.floor(i / chunkSize) + 1}`);
          }
          
          const importData = await importRes.json();
          totalImported += importData.imported || 0;
          
          setUploadProgress(Math.round(((i + chunk.length) / selectedContacts.length) * 100));
        }
        
        toast({
          title: 'Success',
          description: `Created list "${newListName}" with ${totalImported} contacts`,
        });
      }

      // Reset and refresh
      setShowNewList(false);
      setNewListName('');
      setNewListDescription('');
      setUploadedContacts([]);
      setUploadProgress(0);
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
      
      // Build scheduled date if in scheduled mode
      let scheduledAt: string | undefined;
      if (sendMode === 'scheduled' && scheduledDate && scheduledTime) {
        const dateStr = `${scheduledDate}T${scheduledTime}:00`;
        scheduledAt = new Date(dateStr).toISOString();
      }

      // Append opt-out text to message if enabled
      let finalMessage = newCampaign.messageTemplate;
      if (optOutMessageEnabled && optOutMessageText) {
        finalMessage += '\n' + optOutMessageText;
      }

      // Create campaign
      const res = await fetch('/api/campaigns/sms-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accountId: newCampaign.fromAccountId ? parseInt(String(newCampaign.fromAccountId).replace('acc_', '')) : accountId,
          name: newCampaign.name,
          description: newCampaign.description,
          messageTemplate: finalMessage,
          fromNumber: newCampaign.fromNumber,
          contactListId: newCampaign.contactListId ? parseInt(newCampaign.contactListId) : undefined,
          customVariables: Object.keys(newCampaign.customVariables).length > 0 ? newCampaign.customVariables : undefined,
          // Send mode
          sendMode,
          scheduledAt,
          timezone: scheduledTimezone,
          // Drip settings
          dripMessagesPerMinute: sendMode === 'drip' ? messagesPerMinute : undefined,
          dripConcurrentPerNumber: sendMode === 'drip' ? 1 : 20,
          // Time zone scheduling
          timezoneSchedulingEnabled,
          // Campaign options
          forwardNumberOverride: forwardNumberOverride || undefined,
          filterChannelsEnabled,
          disableClaimsEnabled,
          optOutMessageEnabled,
          optOutMessageText: optOutMessageEnabled ? optOutMessageText : undefined,
          // Automated response
          autoResponseEnabled,
          autoResponseMessage: autoResponseEnabled ? autoResponseMessage : undefined,
          autoResponseKeywords: autoResponseEnabled && autoResponseKeywords 
            ? autoResponseKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
            : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create campaign');
      const data = await res.json();

      // Add recipients if contact list selected
      if (newCampaign.contactListId) {
        console.log('[Campaign] Adding recipients - contactListId:', newCampaign.contactListId);
        const recipientsRes = await fetch(`/api/campaigns/sms-campaigns/${data.campaign.id}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            contactListId: parseInt(newCampaign.contactListId),
          }),
        });

        if (!recipientsRes.ok) {
          const errorData = await recipientsRes.json();
          console.error('[Campaign] Failed to add recipients:', errorData);
          throw new Error(errorData.error || 'Failed to add recipients to campaign');
        }

        const recipientsData = await recipientsRes.json();
        console.log('[Campaign] Recipients added:', recipientsData);
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
        customVariables: {},
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
    // Use the phone numbers saved in the campaign (from campaign creation)
    let numbersToUse: string[] = [];
    
    if (campaign?.fromNumber) {
      // Parse comma-separated phone numbers from campaign
      numbersToUse = campaign.fromNumber.split(',').map(n => n.trim()).filter(n => n);
      console.log('[Campaign] Using saved phone numbers from campaign:', numbersToUse);
    } else {
      // Fallback to current selection (shouldn't happen for saved campaigns)
      if (numberSelectionMode === 'all') {
        numbersToUse = filteredNumbers.map(pn => pn.phoneNumber);
      } else if (numberSelectionMode === 'select') {
        numbersToUse = Array.from(selectedFromNumbers);
      }
    }

    if (numbersToUse.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one phone number',
        variant: 'destructive'
      });
      return;
    }

    console.log('[Campaign] Starting campaign with', numbersToUse.length, 'phone numbers');

    setIsSending(true);

    try {
      // Get recipient count (lightweight query, no data transfer)
      const countRes = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/recipients/count`, {
        credentials: 'include',
      });
      
      if (!countRes.ok) {
        throw new Error('Failed to fetch campaign recipient count');
      }
      
      const { count: recipientCount } = await countRes.json();
      
      if (recipientCount === 0) {
        throw new Error('No recipients in campaign. Add a contact list first.');
      }

      // Build phone number configs
      const phoneNumberConfigs = numbersToUse.map(num => {
        const phoneData = phoneNumbers.find(pn => pn.phoneNumber === num);
        return {
          phoneNumber: num,
          provider: phoneData?.provider || 'twilio',
          accountId: phoneData?.accountId,
        };
      });

      // Determine drip mode from campaign's saved settings or local state
      const campaignDripMode = campaign?.sendMode === 'drip' || dripMode;
      const campaignMsgsPerMin = campaign?.dripMessagesPerMinute || messagesPerMinute;

      // Use batch API - server loads recipients from DB directly (handles 30k-50k+ contacts)
      // No need to send recipients over the wire, the server loads from campaign_recipients table
      const batchRes = await fetch('/api/sms/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: campaign?.messageTemplate || '',
          phoneNumbers: phoneNumberConfigs,
          campaignId,
          userId: 1,
          messagesPerNumber: 2000,
          concurrentPerNumber: campaignDripMode ? 1 : 20,
          dripMode: campaignDripMode,
          messagesPerMinute: campaignMsgsPerMin,
        }),
      });

      if (batchRes.ok) {
        const result = await batchRes.json();
        
        // Show warning if not all numbers have valid credentials
        if (result.numbersUsed < result.numbersRequested) {
          const displayNumbers = result.validNumbers?.slice(0, 3) || [];
          const moreCount = (result.validNumbers?.length || 0) - 3;
          toast({
            title: '⚠️ Warning: Limited Phone Numbers',
            description: `Only ${result.numbersUsed} of ${result.numbersRequested} selected numbers have valid credentials.${moreCount > 0 ? ` Using ${displayNumbers.join(', ')} and ${moreCount} more.` : ` Using: ${displayNumbers.join(', ')}`}`,
            variant: 'destructive',
            duration: 10000,
          });
        } else {
          toast({
            title: 'Campaign Started',
            description: `Sending ${result.total.toLocaleString()} messages across ${result.numbersUsed} phone numbers...`,
          });
        }
        
        // Start polling progress for this campaign
        startPollingCampaign(campaignId, { sent: 0, failed: 0, total: result.total });
        setIsSending(false);
        
        // Refresh data to show updated status
        fetchData();
      } else {
        throw new Error('Batch send failed');
      }
    } catch (error: any) {
      console.error('Error starting campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start campaign',
        variant: 'destructive'
      });
      setIsSending(false);
    }
  };

  // Pause campaign (stops sending but can be resumed)
  const handleCancelCampaign = async (campaignId: number) => {
    try {
      const res = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/pause`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to pause campaign');

      toast({
        title: 'Campaign Paused',
        description: 'Campaign paused - you can resume it anytime',
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

  // Pause campaign (soft pause - for non-sending campaigns)
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

  // Complete campaign manually
  const handleCompleteCampaign = async (campaignId: number) => {
    try {
      const res = await fetch(`/api/campaigns/sms-campaigns/${campaignId}/complete`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to complete campaign');

      toast({
        title: 'Campaign Completed',
        description: 'Campaign has been marked as completed',
      });

      fetchData();
    } catch (error: any) {
      console.error('Error completing campaign:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete campaign',
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
    } else if (statusLower === 'in_progress' || statusLower === 'in progress' || statusLower === 'inprogress') {
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          In Progress
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

  // Calculate stats from campaigns
  const stats = {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status === 'sending' || c.status === 'in_progress').length,
    completedCampaigns: campaigns.filter(c => c.status === 'completed').length,
    totalSent: campaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0),
    totalDelivered: campaigns.reduce((sum, c) => sum + (c.deliveredCount || 0), 0),
    totalFailed: campaigns.reduce((sum, c) => sum + (c.failedCount || 0), 0),
    totalRecipients: campaigns.reduce((sum, c) => sum + (c.recipientCount || 0), 0),
    totalContacts: contactLists.reduce((sum, l) => sum + (l.contactCount || 0), 0),
  };

  // Delivery rate = sent / total recipients (how many we successfully sent to)
  const deliveryRate = stats.totalRecipients > 0 
    ? Math.round((stats.totalSent / stats.totalRecipients) * 100) 
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
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import Contacts</DialogTitle>
                <DialogDescription>
                  Upload a CSV file and map your columns to contact fields
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* List Name Input */}
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

                {/* Contact Import Mapper */}
                <ContactImportMapper 
                  onImportComplete={handleContactImportComplete}
                  onCancel={() => setShowNewList(false)}
                />
              </div>
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
                      <div className="flex items-center justify-between">
                        <Label>From Numbers * (Twilio & Commio Only)</Label>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              toast({ title: 'Syncing...', description: 'Validating phone numbers against provider APIs' });
                              const res = await fetch('/api/accounts/sync-all-phone-numbers', {
                                method: 'POST',
                                credentials: 'include'
                              });
                              const data = await res.json();
                              if (data.success) {
                                toast({ 
                                  title: 'Sync Complete', 
                                  description: `${data.accounts?.length || 0} accounts synced. ${data.message}` 
                                });
                                // Refresh phone numbers
                                fetchData();
                              } else {
                                toast({ title: 'Sync Failed', description: data.error || 'Unknown error', variant: 'destructive' });
                              }
                            } catch (err: any) {
                              toast({ title: 'Sync Failed', description: err.message, variant: 'destructive' });
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Sync Numbers
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Only Twilio and Commio numbers can send SMS messages. Click "Sync Numbers" to refresh from provider.
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
                    
                    {/* Send Mode Selector */}
                    <div className="space-y-3 border-t pt-5 mt-5">
                      <Label className="text-base font-semibold">Send Mode</Label>
                      <p className="text-xs text-gray-600">Choose how and when to send your campaign</p>
                      
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => { setSendMode('immediate'); setDripMode(false); }}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            sendMode === 'immediate' 
                              ? 'border-blue-500 bg-blue-50 text-blue-800' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Zap className="h-5 w-5 mx-auto mb-1" />
                          <div className="text-xs font-semibold">Immediate</div>
                          <div className="text-[10px] text-gray-500">Send now</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSendMode('scheduled'); setDripMode(false); }}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            sendMode === 'scheduled' 
                              ? 'border-purple-500 bg-purple-50 text-purple-800' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Clock className="h-5 w-5 mx-auto mb-1" />
                          <div className="text-xs font-semibold">Scheduled</div>
                          <div className="text-[10px] text-gray-500">Send later</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSendMode('drip'); setDripMode(true); }}
                          className={`p-3 rounded-lg border-2 text-center transition-all ${
                            sendMode === 'drip' 
                              ? 'border-green-500 bg-green-50 text-green-800' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Target className="h-5 w-5 mx-auto mb-1" />
                          <div className="text-xs font-semibold">Drip</div>
                          <div className="text-[10px] text-gray-500">Throttled</div>
                        </button>
                      </div>

                      {/* Scheduled Mode Settings */}
                      {sendMode === 'scheduled' && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-purple-600" />
                            <span className="font-semibold text-purple-900 text-sm">Schedule Settings</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-purple-800">Date *</Label>
                              <Input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="border-purple-300 focus:border-purple-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-purple-800">Time *</Label>
                              <Input
                                type="time"
                                value={scheduledTime}
                                onChange={(e) => setScheduledTime(e.target.value)}
                                className="border-purple-300 focus:border-purple-500"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-purple-800">Timezone</Label>
                            <Select value={scheduledTimezone} onValueChange={setScheduledTimezone}>
                              <SelectTrigger className="border-purple-300">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                                <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                                <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                                <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                                <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
                                <SelectItem value="Pacific/Honolulu">Hawaii (HT)</SelectItem>
                                <SelectItem value="UTC">UTC</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {scheduledDate && scheduledTime && (
                            <div className="bg-white rounded-lg p-3 text-xs text-purple-800 border border-purple-100">
                              Campaign will send on <strong>{new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}</strong> ({scheduledTimezone.split('/')[1]?.replace('_', ' ')})
                            </div>
                          )}
                        </div>
                      )}

                      {/* Drip Mode Settings */}
                      {sendMode === 'drip' && (() => {
                        // Calculate effective rate with anti-flagging caps (mirrors backend logic)
                        const numNumbers = numberSelectionMode === 'all'
                          ? filteredNumbers.length
                          : numberSelectionMode === 'select'
                            ? selectedFromNumbers.size
                            : 1;
                        const safeNumNumbers = Math.max(numNumbers, 1);
                        const MIN_PER_NUMBER_DELAY_S = 3; // 3s minimum between sends on same number
                        const maxSafePerNumber = 60 / MIN_PER_NUMBER_DELAY_S; // ~20 msgs/min per number
                        const requestedPerNumber = messagesPerMinute / safeNumNumbers;
                        const effectivePerNumber = Math.min(requestedPerNumber, maxSafePerNumber);
                        const effectiveTotal = Math.round(effectivePerNumber * safeNumNumbers);
                        const isCapped = effectiveTotal < messagesPerMinute;
                        const perNumberDelay = 60 / effectivePerNumber;

                        return (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-600" />
                            <span className="font-semibold text-green-900 text-sm">Drip Settings</span>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-green-800">Messages Per Minute (Total Campaign Rate)</Label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={messagesPerMinute}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setMessagesPerMinute(val ? parseInt(val) : 0);
                              }}
                              onBlur={() => {
                                if (!messagesPerMinute || messagesPerMinute < 1) setMessagesPerMinute(30);
                              }}
                              placeholder="30"
                              className="w-full rounded-md border border-green-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                            />
                            <p className="text-[10px] text-green-600">Recommended: 20–60 msgs/min. Lower is safer for new numbers.</p>
                          </div>

                          {/* Anti-flagging warning */}
                          {isCapped && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                              <strong>Rate capped for safety:</strong> With {safeNumNumbers} number{safeNumNumbers > 1 ? 's' : ''}, max safe rate is <strong>{effectiveTotal} msgs/min</strong> (max ~{maxSafePerNumber}/min per number with {MIN_PER_NUMBER_DELAY_S}s delay). Your {messagesPerMinute} msgs/min will be automatically capped.
                            </div>
                          )}

                          <div className="bg-white rounded-lg p-3 text-xs space-y-1.5 border border-green-100">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Numbers selected:</span>
                              <span className="font-medium">{safeNumNumbers}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Per-number delay:</span>
                              <span className="font-medium">{perNumberDelay.toFixed(1)}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Effective rate:</span>
                              <span className={`font-medium ${isCapped ? 'text-amber-700' : 'text-green-700'}`}>{effectiveTotal} msgs/min</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Est. time for 1,000 msgs:</span>
                              <span className="font-medium">{Math.ceil(1000 / effectiveTotal)} min</span>
                            </div>
                          </div>
                        </div>
                        );
                      })()}
                    </div>

                    {/* Campaign Options */}
                    <div className="space-y-3 border-t pt-5 mt-3">
                      <Label className="text-base font-semibold">Options</Label>
                      
                      {/* Forward Number Override */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Forward Number Override</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Enter Forward Number"
                            value={forwardNumberOverride}
                            onChange={(e) => setForwardNumberOverride(e.target.value)}
                            className="flex-1"
                          />
                          {forwardNumberOverride && (
                            <Button variant="outline" size="sm" onClick={() => setForwardNumberOverride('')}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Toggle Options */}
                      <div className="space-y-2">
                        {/* Filter Channels */}
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <span className="text-sm font-medium">Filter Channels</span>
                            <p className="text-[10px] text-gray-500">Filter out contacts that already have assigned channels</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFilterChannelsEnabled(!filterChannelsEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              filterChannelsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              filterChannelsEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>

                        {/* Disable Campaign Claims */}
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <span className="text-sm font-medium">Disable Campaign Claims</span>
                            <p className="text-[10px] text-gray-500">Campaign level disable claims for round robin assignment</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDisableClaimsEnabled(!disableClaimsEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              disableClaimsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              disableClaimsEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>

                        {/* Time Zone Scheduling */}
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <span className="text-sm font-medium">Time Zone Scheduling</span>
                            <p className="text-[10px] text-gray-500">Send at optimal times across different time zones, East to West</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTimezoneSchedulingEnabled(!timezoneSchedulingEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              timezoneSchedulingEnabled ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                              timezoneSchedulingEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Step 2: Message Content */}
                {campaignStep === 2 && (
                  <>
                    {/* Template Selector */}
                    {messageTemplates.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <Label>Load from Saved Template</Label>
                        <Select
                          onValueChange={(value) => {
                            const template = messageTemplates.find(t => t.id === parseInt(value));
                            if (template) {
                              setNewCampaign(prev => ({ ...prev, messageTemplate: template.content }));
                              // Track template usage
                              fetch(`/api/message-templates/${template.id}/use`, {
                                method: 'POST',
                                credentials: 'include'
                              });
                              toast({
                                title: 'Template Loaded',
                                description: `"${template.name}" template applied`,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a saved template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {messageTemplates.map(template => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{template.name}</span>
                                  {template.category && (
                                    <Badge variant="outline" className="ml-2 text-xs">{template.category}</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="messageTemplate">Message Template *</Label>
                        {newCampaign.messageTemplate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setShowTemplateDialog(true)}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save as Template
                          </Button>
                        )}
                      </div>
                      <Textarea
                        ref={messageTemplateRef}
                        id="messageTemplate"
                        placeholder="Hi {first_name}, quick update - we finalized details on an option around {{debt_loads}}. Please call me back here as soon as you can. 562-606-5539"
                        className="min-h-[150px]"
                        value={newCampaign.messageTemplate}
                        onChange={(e) => setNewCampaign(prev => ({ ...prev, messageTemplate: e.target.value }))}
                      />
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                        <p className="text-xs font-medium text-blue-900 mb-2">Available Merge Tags (click to insert):</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {/* Standard fields - clickable */}
                          {['{first_name}', '{last_name}', '{phone}', '{name}'].map(tag => (
                            <button
                              key={tag}
                              type="button"
                              className="bg-white px-2 py-1 rounded text-blue-700 text-xs border border-blue-200 hover:bg-blue-100 transition-colors"
                              onClick={() => {
                                const textarea = messageTemplateRef.current;
                                if (textarea) {
                                  const start = textarea.selectionStart;
                                  const end = textarea.selectionEnd;
                                  const text = newCampaign.messageTemplate;
                                  const newText = text.substring(0, start) + tag + text.substring(end);
                                  setNewCampaign(prev => ({ ...prev, messageTemplate: newText }));
                                  setTimeout(() => {
                                    textarea.focus();
                                    textarea.setSelectionRange(start + tag.length, start + tag.length);
                                  }, 0);
                                }
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                          {/* Debt loads with automatic $ formatting */}
                          <button
                            type="button"
                            className="bg-green-50 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-100 transition-colors font-medium"
                            onClick={() => {
                              const textarea = messageTemplateRef.current;
                              const tag = '{{debt_loads}}';
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const text = newCampaign.messageTemplate;
                                const newText = text.substring(0, start) + tag + text.substring(end);
                                setNewCampaign(prev => ({ ...prev, messageTemplate: newText }));
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + tag.length, start + tag.length);
                                }, 0);
                              }
                            }}
                            title="Automatically formats with $ sign"
                          >
                            {'{{debt_loads}}'} 💰
                          </button>
                          {/* Total Debt Amount with automatic $ formatting */}
                          <button
                            type="button"
                            className="bg-green-50 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-100 transition-colors font-medium"
                            onClick={() => {
                              const textarea = messageTemplateRef.current;
                              const tag = '{{Total_Debt_Amount}}';
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const text = newCampaign.messageTemplate;
                                const newText = text.substring(0, start) + tag + text.substring(end);
                                setNewCampaign(prev => ({ ...prev, messageTemplate: newText }));
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + tag.length, start + tag.length);
                                }, 0);
                              }
                            }}
                            title="Automatically formats with $ sign"
                          >
                            {'{{Total_Debt_Amount}}'} 💰
                          </button>
                        </div>
                        
                        {/* Custom fields from uploaded contacts OR selected contact list */}
                        {(() => {
                          const customFieldKeys = new Set<string>();
                          
                          // Add fields from uploaded contacts (fresh CSV upload)
                          uploadedContacts.forEach(contact => {
                            if (contact.customFields) {
                              Object.keys(contact.customFields).forEach(key => customFieldKeys.add(key));
                            }
                            Object.keys(contact).forEach(key => {
                              if (!['phoneNumber', 'firstName', 'lastName', 'email', 'selected', 'customFields', 'id'].includes(key)) {
                                customFieldKeys.add(key);
                              }
                            });
                          });
                          
                          // Add fields from selected contact list (existing list)
                          selectedListCustomFields.forEach(key => customFieldKeys.add(key));
                          
                          // Filter out middle name fields
                          const filteredKeys = Array.from(customFieldKeys).filter(key => 
                            !key.includes('middle') && !key.includes('midl') && key !== 'stdaddr_midlnm'
                          );
                          
                          if (filteredKeys.length === 0) return null;
                          
                          return (
                            <>
                              <p className="text-xs font-medium text-green-800 mt-2 mb-1">📊 Custom Fields from Your Contact List:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {filteredKeys.map(field => (
                                  <button
                                    key={field}
                                    type="button"
                                    className="bg-green-100 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-200 transition-colors"
                                    onClick={() => {
                                      const textarea = messageTemplateRef.current;
                                      const tag = `{{${field}}}`;
                                      if (textarea) {
                                        const start = textarea.selectionStart;
                                        const end = textarea.selectionEnd;
                                        const text = newCampaign.messageTemplate;
                                        const newText = text.substring(0, start) + tag + text.substring(end);
                                        setNewCampaign(prev => ({ ...prev, messageTemplate: newText }));
                                        setTimeout(() => {
                                          textarea.focus();
                                          textarea.setSelectionRange(start + tag.length, start + tag.length);
                                        }, 0);
                                      }
                                    }}
                                  >
                                    {`{{${field}}}`}
                                  </button>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                        
                        <p className="text-xs text-blue-700 mt-2">
                          💡 These tags will be replaced with actual values from your contact data when sending.
                        </p>
                      </div>
                    </div>
                    
                    {/* Custom Variables Section */}
                    {(() => {
                      // Detect custom variables in the message template
                      // Supports both {variable} and ${variable} formats
                      const standardVars = ['first_name', 'last_name', 'phone', 'phone_number', 'name', 'firstName', 'lastName', 'phoneNumber'];
                      const varMatches = newCampaign.messageTemplate.match(/\$?\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g) || [];
                      const customVars = [...new Set(varMatches
                        .map(v => v.replace(/[${}]/g, '')) // Remove $, {, and }
                        .filter(v => !standardVars.includes(v))
                      )];
                      
                      // Get all available custom fields from uploaded contacts and selected list
                      const availableFields = new Set<string>();
                      uploadedContacts.forEach(contact => {
                        if (contact.customFields) {
                          Object.keys(contact.customFields).forEach(key => availableFields.add(key));
                        }
                      });
                      selectedListCustomFields.forEach(key => availableFields.add(key));
                      
                      // Check which custom vars are NOT in available fields (need defaults)
                      const varsNeedingDefaults = customVars.filter(v => !availableFields.has(v));
                      const varsWithData = customVars.filter(v => availableFields.has(v));
                      
                      if (customVars.length === 0) return null;
                      
                      // Check for dollar_amount -> debt_loads suggestion
                      const hasDollarAmount = customVars.includes('dollar_amount');
                      const hasDebtLoads = availableFields.has('debt_loads');
                      
                      return (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-amber-900 mb-2">📝 Custom Variables Detected:</p>
                          
                          {/* Show suggestion to use debt_loads instead of dollar_amount */}
                          {hasDollarAmount && hasDebtLoads && (
                            <div className="bg-green-100 border border-green-300 rounded p-2 mb-3">
                              <p className="text-xs text-green-800 font-medium">💡 Tip: Your contact list has <code className="bg-white px-1 rounded">{'{debt_loads}'}</code> data!</p>
                              <p className="text-xs text-green-700 mt-1">
                                Replace <code className="bg-white px-1 rounded">${'{dollar_amount}'}</code> with <code className="bg-white px-1 rounded">{'{debt_loads}'}</code> in your message to use the actual values from your CSV.
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-2 h-7 text-xs bg-white border-green-400 text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  const updatedTemplate = newCampaign.messageTemplate
                                    .replace(/\$\{dollar_amount\}/g, '{debt_loads}')
                                    .replace(/\{dollar_amount\}/g, '{debt_loads}');
                                  setNewCampaign(prev => ({ ...prev, messageTemplate: updatedTemplate }));
                                }}
                              >
                                Replace with {'{debt_loads}'}
                              </Button>
                            </div>
                          )}
                          
                          {varsWithData.length > 0 && (
                            <p className="text-xs text-green-700 mb-2">
                              ✅ <strong>{varsWithData.map(v => `{${v}}`).join(', ')}</strong> will be replaced with values from your contact list.
                            </p>
                          )}
                          
                          {varsNeedingDefaults.length > 0 && (
                            <>
                              <p className="text-xs text-amber-700 mb-3">
                                These variables are not in your contact list. Provide default values below:
                              </p>
                              <div className="space-y-2">
                                {varsNeedingDefaults.map(varName => (
                                  <div key={varName} className="flex items-center gap-2">
                                    <code className="bg-white px-2 py-1 rounded text-amber-700 text-xs min-w-[120px]">{`{${varName}}`}</code>
                                    <Input
                                      placeholder={`Default value for ${varName}`}
                                      className="h-8 text-sm flex-1"
                                      value={newCampaign.customVariables[varName] || ''}
                                      onChange={(e) => setNewCampaign(prev => ({
                                        ...prev,
                                        customVariables: { ...prev.customVariables, [varName]: e.target.value }
                                      }))}
                                    />
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Live Preview - Styled like a phone message */}
                    <div className="bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl p-4 border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold text-gray-700">Live Preview</Label>
                        <span className="text-xs text-gray-500">
                          Characters: <span className={newCampaign.messageTemplate.length > 160 ? 'text-amber-600 font-medium' : ''}>{newCampaign.messageTemplate.length}</span> &nbsp;|&nbsp; 
                          Segments: <span className={Math.ceil(newCampaign.messageTemplate.length / 160) > 1 ? 'text-amber-600 font-medium' : ''}>{Math.ceil(newCampaign.messageTemplate.length / 160) || 0}</span> / 8
                        </span>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border p-4 relative">
                        {/* Phone message bubble styling */}
                        <div className="bg-blue-500 text-white rounded-2xl rounded-br-sm p-3 max-w-[90%] ml-auto">
                          <p className="text-sm whitespace-pre-wrap">
                            {(() => {
                              let preview = newCampaign.messageTemplate
                                .replace(/\{\{firstName\}\}/g, 'John')
                                .replace(/\{first_name\}/g, 'John')
                                .replace(/\{\{lastName\}\}/g, 'Doe')
                                .replace(/\{last_name\}/g, 'Doe')
                                .replace(/\{\{phoneNumber\}\}/g, '+1234567890')
                                .replace(/\{phone_number\}/g, '+1234567890')
                                .replace(/\{phone\}/g, '+1234567890')
                                .replace(/\{name\}/g, 'John Doe');
                              
                              // Replace debt-related fields with formatted currency
                              preview = preview.replace(/\{\{(Total_Debt_Amount|total_debt_amount|debt_loads|debt_load)\}\}/gi, '$42,658');
                              
                              // Replace all custom field tags from uploaded contacts
                              const customFieldSamples: Record<string, string> = {
                                'Total_Debt_Amount': '$42,658',
                                'total_debt_amount': '$42,658',
                                'debt_loads': '$42,658',
                                'debt_load': '$42,658',
                                'total_balance_of_open_bankcard_trades_updated_in_the_past_12_months': '$15,234',
                              };
                              
                              // Replace custom field tags
                              Object.entries(customFieldSamples).forEach(([field, value]) => {
                                const regex = new RegExp(`\\{\\{${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'gi');
                                preview = preview.replace(regex, value);
                              });
                              
                              // Replace custom variables with their default values or sample data
                              Object.entries(newCampaign.customVariables).forEach(([key, value]) => {
                                if (value) {
                                  preview = preview.replace(new RegExp(`\\$?\\{${key}\\}`, 'g'), value);
                                }
                              });
                              
                              // Add opt-out message if enabled
                              if (optOutMessageEnabled && optOutMessageText) {
                                preview += '\n' + optOutMessageText;
                              }
                              
                              return preview || 'Your message preview will appear here...';
                            })()}
                          </p>
                        </div>
                        <p className="text-[10px] text-gray-400 text-right mt-1">
                          From: {newCampaign.fromNumber?.split(',')[0]?.trim() || 'Select a number'}
                        </p>
                      </div>
                    </div>

                    {/* Opt-out Message */}
                    <div className="flex items-center justify-between py-3 border-t">
                      <div>
                        <span className="text-sm font-medium">Opt-out Message</span>
                        <p className="text-[10px] text-gray-500">Include "Reply STOP to Opt-Out" in your message</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOptOutMessageEnabled(!optOutMessageEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          optOutMessageEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          optOutMessageEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    {optOutMessageEnabled && (
                      <Input
                        value={optOutMessageText}
                        onChange={(e) => setOptOutMessageText(e.target.value)}
                        placeholder="Reply STOP to Opt-Out"
                        className="text-sm"
                      />
                    )}

                    {/* Test Your Message */}
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Send className="h-4 w-4 text-emerald-600" />
                        <Label className="text-sm font-semibold text-emerald-800">Test Your Message</Label>
                      </div>
                      <p className="text-xs text-emerald-700 mb-3">Send a test message to verify your campaign before launching.</p>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            placeholder="Enter phone number (e.g., +18571234567)"
                            value={testPhoneNumber}
                            onChange={(e) => setTestPhoneNumber(e.target.value)}
                            className="pr-10 border-emerald-300 focus:border-emerald-500"
                          />
                          {/* Quick select from user's numbers */}
                          {phoneNumbers.length > 0 && (
                            <Select onValueChange={(val) => setTestPhoneNumber(val)}>
                              <SelectTrigger className="absolute right-1 top-1 h-7 w-7 p-0 border-0 bg-transparent hover:bg-emerald-100 rounded">
                                <Phone className="h-4 w-4 text-emerald-600" />
                              </SelectTrigger>
                              <SelectContent>
                                <div className="px-2 py-1 text-xs text-gray-500 border-b">Quick select a number</div>
                                {phoneNumbers.slice(0, 10).map(pn => (
                                  <SelectItem key={pn.phoneNumber} value={pn.phoneNumber}>
                                    {pn.phoneNumber}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <Button
                          variant="default"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={!testPhoneNumber || !newCampaign.messageTemplate || isSendingTest}
                          onClick={async () => {
                            setIsSendingTest(true);
                            try {
                              // Build preview with merge tags replaced - SAME AS LIVE PREVIEW
                              let preview = newCampaign.messageTemplate
                                .replace(/\{\{firstName\}\}/g, 'John')
                                .replace(/\{first_name\}/g, 'John')
                                .replace(/\{\{lastName\}\}/g, 'Doe')
                                .replace(/\{last_name\}/g, 'Doe')
                                .replace(/\{\{phoneNumber\}\}/g, testPhoneNumber)
                                .replace(/\{phone_number\}/g, testPhoneNumber)
                                .replace(/\{phone\}/g, testPhoneNumber)
                                .replace(/\{name\}/g, 'John Doe');
                              
                              // Replace debt-related fields with formatted currency
                              preview = preview.replace(/\{\{(Total_Debt_Amount|total_debt_amount|debt_loads|debt_load)\}\}/gi, '$42,658');
                              
                              // Replace all custom field tags from uploaded contacts
                              const customFieldSamples: Record<string, string> = {
                                'Total_Debt_Amount': '$42,658',
                                'total_debt_amount': '$42,658',
                                'debt_loads': '$42,658',
                                'debt_load': '$42,658',
                                'total_balance_of_open_bankcard_trades_updated_in_the_past_12_months': '$15,234',
                              };
                              
                              // Replace custom field tags
                              Object.entries(customFieldSamples).forEach(([field, value]) => {
                                const regex = new RegExp(`\\{\\{${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'gi');
                                preview = preview.replace(regex, value);
                              });
                              
                              // Replace custom variables with their default values or sample data
                              Object.entries(newCampaign.customVariables).forEach(([key, value]) => {
                                if (value) {
                                  preview = preview.replace(new RegExp(`\\$?\\{${key}\\}`, 'g'), value);
                                }
                              });
                              
                              setTestMessagePreview(preview);
                              
                              // Add opt-out message if enabled
                              const finalMessage = preview + (optOutMessageEnabled ? '\n' + optOutMessageText : '');
                              
                              // Auto-select from number if not specified (pick first available)
                              let fromNumber = newCampaign.fromNumber?.split(',')[0]?.trim();
                              
                              console.log('[Test Message] Initial fromNumber:', fromNumber);
                              console.log('[Test Message] phoneNumbers available:', phoneNumbers.length);
                              console.log('[Test Message] phoneNumbers:', phoneNumbers);
                              
                              if (!fromNumber && phoneNumbers.length > 0) {
                                // Pick first SMS-capable number
                                const smsNumber = phoneNumbers.find(pn => pn.capabilities?.sms !== false);
                                if (smsNumber) {
                                  fromNumber = smsNumber.phoneNumber;
                                  console.log('[Test Message] Auto-selected number:', fromNumber);
                                } else {
                                  fromNumber = phoneNumbers[0].phoneNumber;
                                  console.log('[Test Message] Using first number (no SMS capability check):', fromNumber);
                                }
                              }
                              
                              // Validate from number exists
                              if (!fromNumber) {
                                toast({ 
                                  title: 'No Sender Number', 
                                  description: 'Please add a phone number in Settings or select one in Step 1', 
                                  variant: 'destructive' 
                                });
                                setIsSendingTest(false);
                                return;
                              }
                              
                              console.log('[Test Message] Final fromNumber to use:', fromNumber);
                              
                              // Send test via the provider directly
                              const testRes = await fetch('/api/sms/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({
                                  to: testPhoneNumber,
                                  message: finalMessage,
                                  from: fromNumber,
                                }),
                              });
                              
                              if (testRes.ok) {
                                toast({ title: '✅ Test Sent!', description: `Test message sent to ${testPhoneNumber}` });
                              } else {
                                const err = await testRes.json();
                                toast({ title: 'Test Failed', description: err.error || 'Failed to send test', variant: 'destructive' });
                              }
                            } catch (e: any) {
                              toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            } finally {
                              setIsSendingTest(false);
                            }
                          }}
                        >
                          {isSendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send</>}
                        </Button>
                      </div>
                      {!newCampaign.fromNumber && phoneNumbers.length > 0 && (
                        <p className="text-xs text-blue-600 mt-2">ℹ️ No "From" number selected. Will use first available number from your pool.</p>
                      )}
                      {!newCampaign.fromNumber && phoneNumbers.length === 0 && (
                        <p className="text-xs text-amber-600 mt-2">⚠️ No phone numbers available. Please add a number in Settings.</p>
                      )}
                    </div>

                    {/* Automated Response */}
                    <div className="flex items-center justify-between py-3 border-t">
                      <div>
                        <span className="text-sm font-medium">Automated Response</span>
                        <p className="text-[10px] text-gray-500">Configure an automatic reply for positive responses</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoResponseEnabled(!autoResponseEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          autoResponseEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          autoResponseEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    {autoResponseEnabled && (
                      <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-blue-800">Auto-Reply Message</Label>
                          <Textarea
                            placeholder="Thank you for your response! A representative will be in touch shortly."
                            value={autoResponseMessage}
                            onChange={(e) => setAutoResponseMessage(e.target.value)}
                            className="min-h-[60px] text-sm border-blue-300"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-blue-800">Trigger Keywords (comma-separated)</Label>
                          <Input
                            placeholder="yes, interested, call me, info"
                            value={autoResponseKeywords}
                            onChange={(e) => setAutoResponseKeywords(e.target.value)}
                            className="text-sm border-blue-300"
                          />
                          <p className="text-[10px] text-blue-600">Leave empty to auto-reply to all responses</p>
                        </div>
                      </div>
                    )}
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
                          <div className="text-blue-900 font-medium">
                            {newCampaign.fromNumber ? (
                              newCampaign.fromNumber.includes(',') 
                                ? `${newCampaign.fromNumber.split(',').length} numbers selected`
                                : newCampaign.fromNumber
                            ) : 'Not selected'}
                          </div>
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
                    onClick={() => {
                      console.log('[Campaign] Next clicked - Step:', campaignStep);
                      console.log('[Campaign] Validation:', {
                        name: newCampaign.name,
                        mode: numberSelectionMode,
                        fromNumber: newCampaign.fromNumber,
                        selectedCount: selectedFromNumbers.size,
                        filteredCount: filteredNumbers.length
                      });
                      
                      // Validate Step 1
                      if (campaignStep === 1) {
                        if (!newCampaign.name) {
                          toast({
                            title: 'Missing Information',
                            description: 'Please enter a campaign name',
                            variant: 'destructive'
                          });
                          return;
                        }
                        if (numberSelectionMode === 'single' && !newCampaign.fromNumber) {
                          toast({
                            title: 'Missing Information',
                            description: 'Please select a phone number',
                            variant: 'destructive'
                          });
                          return;
                        }
                        if (numberSelectionMode === 'select' && selectedFromNumbers.size === 0) {
                          toast({
                            title: 'Missing Information',
                            description: 'Please select at least one phone number',
                            variant: 'destructive'
                          });
                          return;
                        }
                        if (numberSelectionMode === 'all' && filteredNumbers.length === 0) {
                          toast({
                            title: 'Missing Information',
                            description: 'No phone numbers available',
                            variant: 'destructive'
                          });
                          return;
                        }
                      }
                      
                      // Validate Step 2
                      if (campaignStep === 2 && !newCampaign.messageTemplate) {
                        toast({
                          title: 'Missing Information',
                          description: 'Please enter a message template',
                          variant: 'destructive'
                        });
                        return;
                      }
                      
                      // Save phone numbers to campaign state when leaving Step 1
                      if (campaignStep === 1) {
                        let fromNumberValue = '';
                        if (numberSelectionMode === 'single') {
                          fromNumberValue = newCampaign.fromNumber;
                        } else if (numberSelectionMode === 'select') {
                          fromNumberValue = Array.from(selectedFromNumbers).join(',');
                        } else if (numberSelectionMode === 'all') {
                          fromNumberValue = filteredNumbers.map(pn => pn.phoneNumber).join(',');
                        }
                        
                        console.log('[Campaign] Saving phone numbers:', fromNumberValue);
                        setNewCampaign(prev => ({ ...prev, fromNumber: fromNumberValue }));
                      }
                      
                      setCampaignStep(prev => prev + 1);
                    }}
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
            <CardTitle className="text-sm font-medium">Total Recipients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRecipients.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Campaign Progress Bars - one per sending/completing campaign */}
      {Object.keys(activeProgressMap).length > 0 && (
        <div className="space-y-3 mb-4">
          {Object.entries(activeProgressMap).map(([idStr, prog]) => {
            const cId = Number(idStr);
            const campaignName = campaigns.find(c => c.id === cId)?.name || `Campaign #${cId}`;
            const pct = prog.total > 0 ? Math.round(((prog.sent + prog.failed) / prog.total) * 100) : 0;
            // Determine effective status: if 100% complete, show as completed regardless of stored status
            const isComplete = pct >= 100 || prog.status === 'completed';
            const effectiveStatus = isComplete ? 'completed' : prog.status;
            const borderColor = effectiveStatus === 'completed' ? 'border-green-200 bg-green-50' : effectiveStatus === 'paused' ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50';
            const textColor = effectiveStatus === 'completed' ? 'text-green-800' : effectiveStatus === 'paused' ? 'text-yellow-800' : 'text-blue-800';
            const pctColor = effectiveStatus === 'completed' ? 'text-green-700' : effectiveStatus === 'paused' ? 'text-yellow-700' : 'text-blue-700';
            return (
              <Card key={cId} className={`shadow-md ${borderColor}`}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {effectiveStatus === 'sending' && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                      {effectiveStatus === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {effectiveStatus === 'paused' && <Clock className="h-4 w-4 text-yellow-600" />}
                      <span className={`font-medium ${textColor}`}>
                        {effectiveStatus === 'sending' ? 'Sending' : effectiveStatus === 'paused' ? 'Paused' : 'Completed'}: {campaignName}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${pctColor}`}>
                      {pct}% — {(prog.sent + prog.failed).toLocaleString()} / {prog.total.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={prog.total > 0 ? ((prog.sent + prog.failed) / prog.total) * 100 : 0} 
                    className="h-3"
                  />
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-green-600">✓ Sent: {prog.sent.toLocaleString()}</span>
                    <span className="text-red-600">✗ Failed: {prog.failed.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
          <TabsTrigger value="templates">
            <FileText className="mr-2 h-4 w-4" />
            Templates ({messageTemplates.length})
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>SMS Campaigns</CardTitle>
                <CardDescription>Manage your SMS marketing campaigns with parallel batch sending</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => {
                  try {
                    toast({ title: 'Syncing...', description: 'Checking delivery statuses from Commio & Twilio...' });
                    
                    // 1. Sync Commio delivery statuses from ThinQ API
                    const commioRes = await fetch('/api/commio/sync-delivery-status', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ limit: 500 }),
                    });
                    const commioData = commioRes.ok ? await commioRes.json() : { synced: 0 };
                    
                    // 2. Recount delivered from DB for all campaigns
                    const res = await fetch('/api/campaigns/sms-campaigns/recount-delivered', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    if (!res.ok) throw new Error('Failed to sync');
                    const data = await res.json();
                    
                    toast({ 
                      title: 'Synced', 
                      description: `Updated ${data.campaignsUpdated} campaigns. Commio: ${commioData.synced || 0} statuses synced.` 
                    });
                    fetchData();
                  } catch (e: any) {
                    toast({ title: 'Error', description: e.message, variant: 'destructive' });
                  }
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Delivered
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                      <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
                        <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
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
                        <TableHead>Failed</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => {
                        // Use progress map for live updates if available, otherwise use campaign data
                        const progress = activeProgressMap[campaign.id];
                        const displayStatus = progress?.status || campaign.status;
                        const displaySent = progress?.sent ?? campaign.sentCount ?? 0;
                        const displayFailed = progress?.failed ?? campaign.failedCount ?? 0;
                        
                        return (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {campaign.name}
                                {campaign.sendMode && campaign.sendMode !== 'immediate' && (
                                  <Badge variant="outline" className={
                                    campaign.sendMode === 'scheduled' ? 'text-purple-700 border-purple-300 bg-purple-50 text-[10px]' :
                                    campaign.sendMode === 'drip' ? 'text-orange-700 border-orange-300 bg-orange-50 text-[10px]' : ''
                                  }>
                                    {campaign.sendMode === 'scheduled' ? 'Scheduled' : 'Drip'}
                                  </Badge>
                                )}
                              </div>
                              {campaign.description && (
                                <div className="text-xs text-muted-foreground">{campaign.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(displayStatus)}</TableCell>
                          <TableCell>{campaign.recipientCount?.toLocaleString() || 0}</TableCell>
                          <TableCell className="text-green-600 font-medium">{displaySent.toLocaleString()}</TableCell>
                          <TableCell className="text-red-600">{displayFailed.toLocaleString()}</TableCell>
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
                                  onClick={() => handleCancelCampaign(campaign.id)}
                                  title="Pause campaign (can be resumed later)"
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
                                  <DropdownMenuItem onClick={() => setViewingCampaignDetail(campaign)}>
                                    <BarChart3 className="mr-2 h-4 w-4" />
                                    View Analytics
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setViewingCampaignDetail(campaign)}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    View Message
                                  </DropdownMenuItem>
                                  {campaign.status === 'paused' && (
                                    <DropdownMenuItem onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/campaigns/sms-campaigns/${campaign.id}/diagnose`, {
                                          credentials: 'include',
                                        });
                                        const data = await res.json();
                                        if (data.canResume) {
                                          toast({
                                            title: '✅ Can Resume',
                                            description: `${data.pendingRecipients} pending, ${data.phoneNumbers.valid.length} valid numbers`,
                                          });
                                        } else {
                                          toast({
                                            title: '⚠️ Cannot Resume',
                                            description: data.resumeMessage,
                                            variant: 'destructive',
                                            duration: 10000,
                                          });
                                        }
                                        console.log('[Diagnose]', data);
                                      } catch (err: any) {
                                        toast({ title: 'Error', description: err.message, variant: 'destructive' });
                                      }
                                    }}>
                                      <AlertCircle className="mr-2 h-4 w-4" />
                                      Diagnose Issue
                                    </DropdownMenuItem>
                                  )}
                                  {campaign.status === 'completed' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/campaigns/sms-campaigns/${campaign.id}/archive`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            credentials: 'include',
                                            body: JSON.stringify({ archived: true }),
                                          });
                                          if (res.ok) {
                                            toast({ title: 'Archived', description: `Campaign "${campaign.name}" archived` });
                                            fetchData();
                                          }
                                        } catch (e: any) {
                                          toast({ title: 'Error', description: e.message, variant: 'destructive' });
                                        }
                                      }}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Archive
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/campaigns/sms-campaigns/${campaign.id}/retarget`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            credentials: 'include',
                                            body: JSON.stringify({ targetStatuses: ['failed', 'pending'] }),
                                          });
                                          if (res.ok) {
                                            const data = await res.json();
                                            toast({ title: 'Retarget Created', description: `New campaign with ${data.recipientsRetargeted} recipients` });
                                            fetchData();
                                          }
                                        } catch (e: any) {
                                          toast({ title: 'Error', description: e.message, variant: 'destructive' });
                                        }
                                      }}>
                                        <Target className="mr-2 h-4 w-4" />
                                        Retarget
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
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
                              <DropdownMenuItem onClick={() => handleViewContacts(list.id, list.name)}>
                                <Users className="mr-2 h-4 w-4" />
                                View Contacts
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditingList({ id: list.id, name: list.name, description: list.description || '' })}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit List
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExportCSV(list.id, list.name)} disabled={isExporting}>
                                <Download className="mr-2 h-4 w-4" />
                                Export CSV
                              </DropdownMenuItem>
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

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Message Templates</CardTitle>
                <CardDescription>Create and manage reusable message templates for your campaigns</CardDescription>
              </div>
              <Button onClick={() => {
                setNewTemplate({ name: '', content: '', description: '', category: '' });
                setShowTemplateDialog(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </CardHeader>
            <CardContent>
              {messageTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                  <p className="text-muted-foreground mb-4">Create reusable message templates to speed up campaign creation</p>
                  <Button onClick={() => {
                    setNewTemplate({ name: '', content: '', description: '', category: '' });
                    setShowTemplateDialog(true);
                  }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {messageTemplates.map((template) => (
                    <Card key={template.id} className="relative">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            {template.category && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {template.category.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setNewCampaign(prev => ({ ...prev, messageTemplate: template.content }));
                                setActiveTab('campaigns');
                                setShowNewCampaign(true);
                                setCampaignStep(2);
                                toast({
                                  title: 'Template Applied',
                                  description: `"${template.name}" loaded into new campaign`,
                                });
                              }}>
                                <Send className="mr-2 h-4 w-4" />
                                Use in Campaign
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                navigator.clipboard.writeText(template.content);
                                toast({
                                  title: 'Copied',
                                  description: 'Template content copied to clipboard',
                                });
                              }}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy Content
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setNewTemplate({
                                  name: template.name,
                                  content: template.content,
                                  description: template.description || '',
                                  category: template.category || ''
                                });
                                setEditingTemplateId(template.id);
                                setShowTemplateDialog(true);
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={async () => {
                                  if (confirm(`Delete template "${template.name}"?`)) {
                                    try {
                                      const res = await fetch(`/api/message-templates/${template.id}`, {
                                        method: 'DELETE',
                                        credentials: 'include'
                                      });
                                      if (res.ok) {
                                        setMessageTemplates(prev => prev.filter(t => t.id !== template.id));
                                        toast({
                                          title: 'Deleted',
                                          description: 'Template deleted successfully',
                                        });
                                      }
                                    } catch (error) {
                                      toast({
                                        title: 'Error',
                                        description: 'Failed to delete template',
                                        variant: 'destructive'
                                      });
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-2">
                          {template.content}
                        </p>
                        {template.description && (
                          <p className="text-xs text-muted-foreground italic">
                            {template.description}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="text-xs text-muted-foreground pt-0 flex justify-between">
                        <span>Used {template.usageCount || 0} times</span>
                        <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Save/Edit Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={(open) => {
        setShowTemplateDialog(open);
        if (!open) {
          setEditingTemplateId(null);
          setNewTemplate({ name: '', content: '', description: '', category: '' });
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingTemplateId ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplateId ? 'Update your message template.' : 'Create a reusable message template for your campaigns.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name *</Label>
              <Input
                id="templateName"
                placeholder="e.g., Debt Collection Follow-up"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateContent">Message Content *</Label>
              <Textarea
                id="templateContent"
                placeholder="Hi {first_name}, quick update - we finalized details on an option around ${dollar_amount}. Please call me back here as soon as you can."
                className="min-h-[120px]"
                value={newTemplate.content || newCampaign.messageTemplate}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
              />
              
              {/* Available Merge Tags */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-900 mb-2">Available Merge Tags (click to insert):</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {/* Standard fields */}
                  {['{first_name}', '{last_name}', '{phone}', '{name}'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className="bg-white px-2 py-1 rounded text-blue-700 text-xs border border-blue-200 hover:bg-blue-100 transition-colors"
                      onClick={() => {
                        const content = newTemplate.content || newCampaign.messageTemplate || '';
                        setNewTemplate(prev => ({ ...prev, content: content + tag }));
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  {/* Debt loads with automatic $ formatting */}
                  <button
                    type="button"
                    className="bg-green-50 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-100 transition-colors font-medium"
                    onClick={() => {
                      const content = newTemplate.content || newCampaign.messageTemplate || '';
                      setNewTemplate(prev => ({ ...prev, content: content + '{{debt_loads}}' }));
                    }}
                    title="Automatically formats with $ sign"
                  >
                    {'{{debt_loads}}'} 💰
                  </button>
                  {/* Total Debt Amount with automatic $ formatting */}
                  <button
                    type="button"
                    className="bg-green-50 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-100 transition-colors font-medium"
                    onClick={() => {
                      const content = newTemplate.content || newCampaign.messageTemplate || '';
                      setNewTemplate(prev => ({ ...prev, content: content + '{{Total_Debt_Amount}}' }));
                    }}
                    title="Automatically formats with $ sign"
                  >
                    {'{{Total_Debt_Amount}}'} 💰
                  </button>
                </div>
                
                {/* Custom fields from uploaded contacts */}
                {(() => {
                  // Get unique custom field keys from uploaded contacts
                  const customFieldKeys = new Set<string>();
                  uploadedContacts.forEach(contact => {
                    if (contact.customFields) {
                      Object.keys(contact.customFields).forEach(key => customFieldKeys.add(key));
                    }
                    // Also check for fields directly on contact (legacy format)
                    Object.keys(contact).forEach(key => {
                      if (!['phoneNumber', 'firstName', 'lastName', 'email', 'selected', 'customFields', 'id'].includes(key)) {
                        customFieldKeys.add(key);
                      }
                    });
                  });
                  
                  // Filter out middle name fields
                  const filteredKeys = Array.from(customFieldKeys).filter(key => 
                    !key.includes('middle') && !key.includes('midl') && key !== 'stdaddr_midlnm'
                  );
                  
                  if (filteredKeys.length === 0) return null;
                  
                  return (
                    <>
                      <p className="text-xs font-medium text-green-800 mt-2 mb-1">📊 Custom Fields from Your CSV:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredKeys.map(field => (
                          <button
                            key={field}
                            type="button"
                            className="bg-green-100 px-2 py-1 rounded text-green-700 text-xs border border-green-300 hover:bg-green-200 transition-colors"
                            onClick={() => {
                              const content = newTemplate.content || newCampaign.messageTemplate || '';
                              setNewTemplate(prev => ({ ...prev, content: content + `{${field}}` }));
                            }}
                          >
                            {`{${field}}`}
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
                
                <p className="text-xs text-blue-600 mt-2">
                  💡 These tags will be replaced with actual values from your contact data when sending.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateCategory">Category</Label>
              <Select
                value={newTemplate.category}
                onValueChange={(value) => setNewTemplate(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debt_collection">Debt Collection</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                  <SelectItem value="reminders">Reminders</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="templateDescription">Description (optional)</Label>
              <Input
                id="templateDescription"
                placeholder="Brief description of when to use this template"
                value={newTemplate.description}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowTemplateDialog(false);
              setEditingTemplateId(null);
              setNewTemplate({ name: '', content: '', description: '', category: '' });
            }}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const content = newTemplate.content || newCampaign.messageTemplate;
                if (!newTemplate.name || !content) {
                  toast({
                    title: 'Error',
                    description: 'Template name and content are required',
                    variant: 'destructive'
                  });
                  return;
                }
                try {
                  const url = editingTemplateId 
                    ? `/api/message-templates/${editingTemplateId}`
                    : '/api/message-templates';
                  const method = editingTemplateId ? 'PUT' : 'POST';
                  
                  const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      name: newTemplate.name,
                      content: content,
                      description: newTemplate.description,
                      category: newTemplate.category,
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (editingTemplateId) {
                      setMessageTemplates(prev => prev.map(t => t.id === editingTemplateId ? data.template : t));
                    } else {
                      setMessageTemplates(prev => [...prev, data.template]);
                    }
                    setShowTemplateDialog(false);
                    setEditingTemplateId(null);
                    setNewTemplate({ name: '', content: '', description: '', category: '' });
                    toast({
                      title: editingTemplateId ? 'Template Updated' : 'Template Saved',
                      description: `"${newTemplate.name}" has been ${editingTemplateId ? 'updated' : 'saved'}`,
                    });
                  } else {
                    throw new Error('Failed to save template');
                  }
                } catch (error) {
                  toast({
                    title: 'Error',
                    description: 'Failed to save template',
                    variant: 'destructive'
                  });
                }
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Contacts Dialog */}
      <Dialog open={!!viewingList} onOpenChange={(open) => !open && setViewingList(null)}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Contacts in "{viewingList?.name}"</DialogTitle>
            <DialogDescription>
              {viewingList?.contacts.length || 0} contacts in this list
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  <TableHead>Email</TableHead>
                  {/* Dynamically show custom field headers */}
                  {viewingList?.contacts && viewingList.contacts.length > 0 && viewingList.contacts[0].customFields && 
                    Object.keys(viewingList.contacts[0].customFields).slice(0, 3).map(fieldName => (
                      <TableHead key={fieldName} className="capitalize">
                        {fieldName.replace(/_/g, ' ')}
                      </TableHead>
                    ))
                  }
                </TableRow>
              </TableHeader>
              <TableBody>
                {(viewingList?.contacts || []).slice(0, 100).map((contact, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{contact.phoneNumber}</TableCell>
                    <TableCell>{contact.firstName || '-'}</TableCell>
                    <TableCell>{contact.lastName || '-'}</TableCell>
                    <TableCell>{contact.email || '-'}</TableCell>
                    {/* Dynamically show custom field values */}
                    {viewingList?.contacts && viewingList.contacts.length > 0 && viewingList.contacts[0].customFields && 
                      Object.keys(viewingList.contacts[0].customFields).slice(0, 3).map(fieldName => (
                        <TableCell key={fieldName}>
                          {contact.customFields?.[fieldName] || '-'}
                        </TableCell>
                      ))
                    }
                  </TableRow>
                ))}
                {(viewingList?.contacts.length || 0) > 100 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
                      Showing first 100 of {viewingList?.contacts.length} contacts
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingList(null)}>
              Close
            </Button>
            <Button onClick={() => viewingList && handleExportCSV(viewingList.id, viewingList.name)}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit List Dialog */}
      <Dialog open={!!editingList} onOpenChange={(open) => !open && setEditingList(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Contact List</DialogTitle>
            <DialogDescription>
              Update the name and description of this contact list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editListName">List Name *</Label>
              <Input
                id="editListName"
                value={editingList?.name || ''}
                onChange={(e) => setEditingList(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editListDescription">Description</Label>
              <Input
                id="editListDescription"
                placeholder="Optional description"
                value={editingList?.description || ''}
                onChange={(e) => setEditingList(prev => prev ? { ...prev, description: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingList(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditList} disabled={!editingList?.name}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Detail / Analytics Dialog */}
      <Dialog open={!!viewingCampaignDetail} onOpenChange={(open) => !open && setViewingCampaignDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewingCampaignDetail && (() => {
            const c = viewingCampaignDetail;
            const deliveryRate = c.recipientCount > 0 ? ((c.sentCount || 0) / c.recipientCount * 100).toFixed(1) : '0';
            const deliveredRate = (c.sentCount || 0) > 0 ? (((c.deliveredCount || 0) / (c.sentCount || 1)) * 100).toFixed(1) : '0';
            const undelivered = (c.sentCount || 0) - (c.deliveredCount || 0) - (c.failedCount || 0);
            const undeliveredRate = (c.sentCount || 0) > 0 ? ((undelivered / (c.sentCount || 1)) * 100).toFixed(1) : '0';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">{c.name}</DialogTitle>
                  <DialogDescription>
                    ID: {c.id} &nbsp; Created: {new Date(c.createdAt).toLocaleString()}
                  </DialogDescription>
                </DialogHeader>

                {/* Delivery Metrics */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-gray-700">Delivery Metrics</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-800">{(c.sentCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-blue-600">Sent</div>
                      <div className="text-lg font-semibold text-blue-700">{c.recipientCount || 0}</div>
                      <div className="text-xs text-blue-500">{deliveryRate}%</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-800">{(c.deliveredCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-green-600">Delivered</div>
                      <div className="text-lg font-semibold text-green-700">{c.recipientCount || 0}</div>
                      <div className="text-xs text-green-500">{deliveredRate}%</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-800">{(c.failedCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-red-600">Undelivered</div>
                      <div className="text-lg font-semibold text-red-700">{undelivered > 0 ? undelivered : 0}</div>
                      <div className="text-xs text-red-500">{undeliveredRate}%</div>
                    </div>
                  </div>

                  {/* Engagement & Issue Tracking */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-700 mb-2">Engagement Metrics</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">0</div>
                          <div className="text-[10px] text-gray-500">Responses</div>
                          <div className="text-xs text-green-600">0.0%</div>
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">0</div>
                          <div className="text-[10px] text-gray-500">Link Clicks</div>
                          <div className="text-xs text-green-600">0.0%</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-700 mb-2">Issue Tracking</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">{c.recipientCount || 0}</div>
                          <div className="text-[10px] text-gray-500">Segments</div>
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">{c.failedCount || 0}</div>
                          <div className="text-[10px] text-gray-500">Invalid Numbers</div>
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">0</div>
                          <div className="text-[10px] text-gray-500">Spam Reports</div>
                        </div>
                        <div className="bg-gray-50 border rounded-lg p-2 text-center">
                          <div className="text-lg font-bold">{c.optOutCount || 0}</div>
                          <div className="text-[10px] text-gray-500">Opt-outs</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Text Message */}
                  <div>
                    <h3 className="font-semibold text-sm text-gray-700 mb-2">Text Message</h3>
                    <div className="bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {c.messageTemplate}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setViewingCampaignDetail(null);
                      }}
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Close
                    </Button>
                    {c.status === 'completed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/campaigns/sms-campaigns/${c.id}/archive`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ archived: true }),
                              });
                              if (res.ok) {
                                toast({ title: 'Archived', description: `Campaign "${c.name}" archived` });
                                setViewingCampaignDetail(null);
                                fetchData();
                              }
                            } catch (e: any) {
                              toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Archive
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/campaigns/sms-campaigns/${c.id}/retarget`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ targetStatuses: ['failed', 'pending'] }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                toast({ title: 'Retarget Created', description: `New campaign with ${data.recipientsRetargeted} recipients` });
                                setViewingCampaignDetail(null);
                                fetchData();
                              }
                            } catch (e: any) {
                              toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Target className="mr-2 h-4 w-4" />
                          Retarget
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
