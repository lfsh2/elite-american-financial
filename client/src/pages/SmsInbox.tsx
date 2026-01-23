import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAccount } from '@/contexts/AccountContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  Mail,
  Clock,
  Star,
  Phone,
  MessageSquare,
  Send,
  Bell,
  Copy,
  Trash2,
  Archive,
  User,
  UserPlus,
  ChevronDown,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Filter,
  X,
  Users,
  Calendar,
  Zap,
  CheckSquare,
  Check,
  Square,
  ListPlus,
  Megaphone,
  Hash,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  contactPhone: string;
  contactName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isStarred: boolean;
  messages: Message[];
}

interface Contact {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  birthday?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  source?: string;
  isSaved?: boolean; // Whether contact exists in database
}

export default function SmsInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentAccount } = useAccount();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'recents' | 'starred'>('all');
  const [isSending, setIsSending] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(true);
  
  // Batch selection & broadcast
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [selectedFromNumber, setSelectedFromNumber] = useState('');
  const [selectedFromNumbers, setSelectedFromNumbers] = useState<Set<string>>(new Set()); // Multi-select
  const [numberSelectionMode, setNumberSelectionMode] = useState<'all' | 'select' | 'single'>('all'); // all=use all, select=pick multiple, single=one number
  
  // Campaign selection for batch sending
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [createNewCampaign, setCreateNewCampaign] = useState(true);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [sendingProgress, setSendingProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchPhoneNumbers();
    fetchCampaigns();
  }, [currentAccount]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages]);

  const fetchPhoneNumbers = async () => {
    try {
      const accountsRes = await fetch('/api/accounts', { credentials: 'include' });
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const allPhoneNumbers: any[] = [];
        
        for (const acc of accountsData.accounts || []) {
          try {
            const phonesRes = await fetch(`/api/accounts/${acc.id}/phone-numbers`, { credentials: 'include' });
            if (phonesRes.ok) {
              const data = await phonesRes.json();
              const numbersWithAccount = (data.phoneNumbers || []).map((pn: any) => ({
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
        if (allPhoneNumbers.length > 0) {
          setSelectedFromNumber(allPhoneNumbers[0].phoneNumber);
        }
      }
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns/sms-campaigns', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  const fetchConversations = async (useCache = true, page = 1) => {
    setIsLoading(true);
    try {
      const cacheKey = 'smsInbox_conversations';
      const cacheExpiry = 'smsInbox_expiry';
      
      // Check cache first for instant load
      if (useCache && page === 1) {
        const cached = sessionStorage.getItem(cacheKey);
        const expiry = sessionStorage.getItem(cacheExpiry);
        if (cached && expiry && Date.now() < parseInt(expiry)) {
          const cachedConversations = JSON.parse(cached);
          setConversations(cachedConversations);
          if (cachedConversations.length > 0 && !selectedConversation) {
            handleSelectConversation(cachedConversations[0]);
          }
          setIsLoading(false);
          // Refresh in background
          fetchConversations(false, 1);
          return;
        }
      }
      
      // Try the new optimized database API first, fallback to old API
      let conversationsList: Conversation[] = [];
      
      try {
        // New optimized API with pagination
        const res = await fetch(`/api/conversations?page=${page}&limit=50&period=thisMonth`, { 
          credentials: 'include' 
        });
        
        if (res.ok) {
          const data = await res.json();
          console.log('[SmsInbox] Fetched conversations from DB:', data.conversations?.length || 0);
          
          conversationsList = (data.conversations || []).map((conv: any) => ({
            id: conv.contactPhone,
            contactPhone: conv.contactPhone,
            // Use contact name from database if available, otherwise format phone number
            contactName: conv.contactName || getContactName(conv.contactPhone),
            lastMessage: conv.lastMessage || '',
            lastMessageTime: conv.lastMessageTime || new Date().toISOString(),
            unreadCount: conv.unreadCount || 0,
            isStarred: false,
            messages: [], // Messages loaded on demand when conversation is selected
          }));
        }
      } catch (dbError) {
        console.log('[SmsInbox] DB API not available, falling back to provider API');
      }
      
      // Fallback to old API if new one returns empty or fails
      if (conversationsList.length === 0) {
        const res = await fetch('/api/data/messages?period=thisWeek&limit=200', { credentials: 'include' });
        
        if (res.ok) {
          const data = await res.json();
          const messages = data.messages || [];
          console.log('[SmsInbox] Fallback: Fetched messages:', messages.length);
          
          const conversationMap = new Map<string, Conversation>();
          
          messages.forEach((msg: any) => {
            if (!msg.from || !msg.to || !msg.body) return;
            
            const contactPhone = msg.direction === 'inbound' ? msg.from : msg.to;
            const existing = conversationMap.get(contactPhone);
            
            const message: Message = {
              id: msg.sid || msg.id || msg.messageSid || String(Math.random()),
              from: msg.from,
              to: msg.to,
              body: msg.body,
              direction: msg.direction === 'inbound' ? 'inbound' : 'outbound',
              status: msg.status || 'sent',
              createdAt: msg.dateSent || msg.createdAt || msg.dateCreated || new Date().toISOString(),
            };
            
            if (existing) {
              existing.messages.push(message);
              if (new Date(message.createdAt) > new Date(existing.lastMessageTime)) {
                existing.lastMessage = message.body;
                existing.lastMessageTime = message.createdAt;
              }
              if (msg.direction === 'inbound' && msg.status !== 'read') {
                existing.unreadCount++;
              }
            } else {
              conversationMap.set(contactPhone, {
                id: contactPhone,
                contactPhone,
                contactName: getContactName(contactPhone),
                lastMessage: message.body,
                lastMessageTime: message.createdAt,
                unreadCount: msg.direction === 'inbound' && msg.status !== 'read' ? 1 : 0,
                isStarred: false,
                messages: [message],
              });
            }
          });
          
          conversationsList = Array.from(conversationMap.values())
            .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
        }
      }
      
      console.log('[SmsInbox] Total conversations:', conversationsList.length);
      setConversations(conversationsList);
      
      // Cache for 2 minutes
      if (page === 1) {
        sessionStorage.setItem(cacheKey, JSON.stringify(conversationsList));
        sessionStorage.setItem(cacheExpiry, String(Date.now() + 2 * 60 * 1000));
      }
      
      if (conversationsList.length > 0 && !selectedConversation) {
        handleSelectConversation(conversationsList[0]);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneDisplay = (phone: string): string => {
    // Format phone number for display: +1 (404) 618-7243
    if (phone.startsWith('+1') && phone.length === 12) {
      return `+1 (${phone.substring(2, 5)}) ${phone.substring(5, 8)}-${phone.substring(8)}`;
    }
    return phone;
  };

  const getContactName = (phone: string): string => {
    // Just return the formatted phone number - no fake names
    return formatPhoneDisplay(phone);
  };

  // Extract name from message body - looks for patterns like "Keith, you're approved" or "Hi John,"
  const extractNameFromMessage = (messages: Message[]): string | null => {
    // Look through outbound messages first (they usually contain the recipient's name)
    const outboundMessages = messages.filter(m => m.direction === 'outbound');
    
    for (const msg of outboundMessages) {
      const body = msg.body;
      
      // Pattern 1: "Name, you're" or "Name, your" (common in marketing messages)
      const pattern1 = body.match(/^([A-Z][a-z]+),\s+you(?:'re|r)/);
      if (pattern1) return pattern1[1];
      
      // Pattern 2: "Hi Name," or "Hello Name," or "Hey Name,"
      const pattern2 = body.match(/^(?:Hi|Hello|Hey)\s+([A-Z][a-z]+)[,!]/i);
      if (pattern2) return pattern2[1];
      
      // Pattern 3: "Dear Name," 
      const pattern3 = body.match(/^Dear\s+([A-Z][a-z]+)[,]/i);
      if (pattern3) return pattern3[1];
      
      // Pattern 4: Name at the start followed by comma (like "Keith, you're approved")
      const pattern4 = body.match(/^([A-Z][a-z]{2,15}),\s/);
      if (pattern4) return pattern4[1];
    }
    
    return null;
  };

  const getInitials = (name: string): string => {
    // For phone numbers, use last 2 digits
    if (name.includes('(') || name.startsWith('+')) {
      const digits = name.replace(/\D/g, '');
      return digits.slice(-2);
    }
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string): string => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500'];
    const index = Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length;
    return colors[index];
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    // Set conversation immediately with existing messages (may be empty)
    setSelectedConversation({ ...conversation, messages: conversation.messages || [] });
    
    // Helper to update contact details
    const updateContactDetails = (messages: Message[], contactName: string) => {
      // Try to extract name from message body first
      const extractedName = extractNameFromMessage(messages);
      
      let firstName = '';
      let lastName = '';
      
      if (extractedName) {
        // Use extracted name from message
        firstName = extractedName;
        lastName = formatPhoneDisplay(conversation.contactPhone).replace('+1 ', '');
        console.log('[SmsInbox] Extracted name from message:', extractedName);
      } else {
        // Parse contact name - if it looks like a phone number, split differently
        const isPhoneFormat = contactName.startsWith('+') || /^\d/.test(contactName);
        
        if (isPhoneFormat) {
          const formatted = formatPhoneDisplay(conversation.contactPhone);
          firstName = '+1';
          lastName = formatted.replace('+1 ', '');
        } else {
          const nameParts = contactName.split(' ');
          firstName = nameParts[0] || '';
          lastName = nameParts.slice(1).join(' ') || '';
        }
      }
      
      setSelectedContact({
        phone: conversation.contactPhone,
        firstName,
        lastName,
        email: `${firstName.toLowerCase().replace(/[^a-z]/g, '') || 'contact'}@example.com`,
        source: 'SMS Campaign',
      });
    };

    // Initial contact details (may be updated after messages load)
    updateContactDetails(conversation.messages || [], conversation.contactName);

    // Fetch messages for this conversation if not already loaded
    if (!conversation.messages || conversation.messages.length === 0) {
      try {
        const encodedPhone = encodeURIComponent(conversation.contactPhone);
        const res = await fetch(`/api/conversations/${encodedPhone}/messages?limit=100`, { 
          credentials: 'include' 
        });
        
        if (res.ok) {
          const data = await res.json();
          const messages: Message[] = (data.messages || []).map((msg: any) => ({
            id: msg.id?.toString() || msg.messageSid || String(Math.random()),
            from: msg.from,
            to: msg.to,
            body: msg.body,
            direction: msg.direction?.startsWith('outbound') ? 'outbound' : 'inbound',
            status: msg.status || 'sent',
            createdAt: msg.sentAt || msg.createdAt || new Date().toISOString(),
          }));
          
          console.log('[SmsInbox] Loaded messages for conversation:', messages.length);
          
          // Update the conversation with fetched messages
          setSelectedConversation(prev => prev ? { ...prev, messages } : null);
          
          // Try to extract name from messages
          const extractedName = extractNameFromMessage(messages);
          
          // Also update the conversations list with messages and extracted name
          setConversations(prevConvs => 
            prevConvs.map(c => 
              c.contactPhone === conversation.contactPhone 
                ? { 
                    ...c, 
                    messages,
                    // Update contact name if we extracted one from the message
                    contactName: extractedName || c.contactName,
                  } 
                : c
            )
          );
          
          // Update contact details with extracted name from messages
          updateContactDetails(messages, extractedName || conversation.contactName);
        }
      } catch (error) {
        console.error('[SmsInbox] Error fetching conversation messages:', error);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    if (!selectedFromNumber) {
      toast({ title: 'Error', description: 'Please select a phone number to send from.', variant: 'destructive' });
      return;
    }
    
    setIsSending(true);
    try {
      // Send message via API
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: 1, // TODO: Get from auth context
          to: selectedConversation.contactPhone,
          from: selectedFromNumber,
          body: newMessage,
          direction: 'outbound',
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to send message');
      }

      const result = await res.json();
      
      const newMsg: Message = {
        id: result.id?.toString() || String(Date.now()),
        from: selectedFromNumber,
        to: selectedConversation.contactPhone,
        body: newMessage,
        direction: 'outbound',
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      
      setSelectedConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, newMsg],
        lastMessage: newMessage,
        lastMessageTime: newMsg.createdAt,
      } : null);
      
      // Also store in database for future retrieval
      try {
        await fetch('/api/conversations/store-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            to: selectedConversation.contactPhone,
            from: selectedFromNumber,
            body: newMessage,
            direction: 'outbound',
            status: 'sent',
            messageSid: result.messageSid,
          }),
        });
      } catch (e) {
        console.log('[SmsInbox] Message stored via webhook');
      }
      
      setNewMessage('');
      toast({ title: 'Message Sent', description: 'Your message has been sent successfully.' });
    } catch (error: any) {
      console.error('[SmsInbox] Send error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to send message.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredConversations = conversations.filter(conv => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!conv.contactName.toLowerCase().includes(query) && 
          !conv.contactPhone.includes(query) &&
          !conv.lastMessage.toLowerCase().includes(query)) return false;
    }
    
    switch (activeFilter) {
      case 'unread': return conv.unreadCount > 0;
      case 'starred': return conv.isStarred;
      case 'recents':
        const hourAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return new Date(conv.lastMessageTime) > hourAgo;
      default: return true;
    }
  });

  const toggleStar = (convId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isStarred: !c.isStarred } : c));
  };

  const toggleSelectContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const selectAllContacts = () => {
    if (selectedContacts.size === filteredConversations.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredConversations.map(c => c.id)));
    }
  };

  const handleBroadcastSend = async () => {
    // Validate based on number selection mode
    if (!broadcastMessage.trim() || selectedContacts.size === 0) {
      toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    // Validate number selection based on mode
    if (numberSelectionMode === 'single' && !selectedFromNumber) {
      toast({ title: 'Error', description: 'Please select a phone number.', variant: 'destructive' });
      return;
    }

    if (numberSelectionMode === 'select' && selectedFromNumbers.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one phone number.', variant: 'destructive' });
      return;
    }

    if (numberSelectionMode === 'all' && phoneNumbers.length === 0) {
      toast({ title: 'Error', description: 'No phone numbers available.', variant: 'destructive' });
      return;
    }

    // Validate campaign selection
    if (!createNewCampaign && !selectedCampaignId) {
      toast({ title: 'Error', description: 'Please select a campaign or create a new one.', variant: 'destructive' });
      return;
    }

    if (createNewCampaign && !newCampaignName.trim()) {
      toast({ title: 'Error', description: 'Please enter a campaign name.', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    setShowProgress(true);
    
    try {
      const recipientIds = Array.from(selectedContacts);
      const recipientPhones = conversations
        .filter(c => recipientIds.includes(c.id))
        .map(c => ({ phone: c.contactPhone, name: c.contactName }));
      
      setSendingProgress({ sent: 0, failed: 0, total: recipientPhones.length });

      // Determine which numbers to use for rotation
      let numbersToUse: string[] = [];
      if (numberSelectionMode === 'all') {
        numbersToUse = phoneNumbers.map(pn => pn.phoneNumber);
      } else if (numberSelectionMode === 'select') {
        numbersToUse = Array.from(selectedFromNumbers);
      } else {
        numbersToUse = [selectedFromNumber];
      }

      // Create or use existing campaign
      let campaignId: number | null = null;
      const fromNumberForCampaign = numberSelectionMode === 'single' ? selectedFromNumber : `pool:${numbersToUse.length}`;
      
      if (createNewCampaign) {
        // Create new campaign
        const campaignRes = await fetch('/api/campaigns/sms-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: newCampaignName,
            description: `Broadcast to ${recipientPhones.length} recipients`,
            messageTemplate: broadcastMessage,
            fromNumber: fromNumberForCampaign,
            status: 'sending',
          }),
        });

        if (campaignRes.ok) {
          const campaignData = await campaignRes.json();
          campaignId = campaignData.campaign?.id;
        }
      } else {
        campaignId = parseInt(selectedCampaignId);
      }

      // Build phone number configs with provider info
      const phoneNumberConfigs = numbersToUse.map(num => {
        const phoneData = phoneNumbers.find(pn => pn.phoneNumber === num);
        return {
          phoneNumber: num,
          provider: phoneData?.provider || 'twilio',
          accountId: phoneData?.accountId,
        };
      });

      // Use batch API for parallel sending across all numbers
      const batchRes = await fetch('/api/sms/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipients: recipientPhones,
          message: broadcastMessage,
          phoneNumbers: phoneNumberConfigs,
          campaignId,
          userId: 1,
          messagesPerNumber: 2000, // Each number can handle 2000 messages
          concurrentPerNumber: 20, // 20 concurrent requests per number
        }),
      });

      let sentCount = 0;
      let failedCount = 0;

      if (batchRes.ok) {
        const result = await batchRes.json();
        sentCount = result.sent;
        failedCount = result.failed;
        setSendingProgress({ sent: sentCount, failed: failedCount, total: recipientPhones.length });
        
        console.log(`[BatchSMS] Completed in ${result.duration}ms: ${sentCount} sent, ${failedCount} failed`);
      } else {
        // Fallback to sequential sending if batch fails
        console.warn('[BatchSMS] Batch API failed, falling back to sequential');
        for (let i = 0; i < recipientPhones.length; i++) {
          const recipient = recipientPhones[i];
          try {
            const fromNumber = numbersToUse[i % numbersToUse.length];
            const personalizedMessage = broadcastMessage
              .replace(/\{\{firstName\}\}/g, recipient.name?.split(' ')[0] || '')
              .replace(/\{\{lastName\}\}/g, recipient.name?.split(' ').slice(1).join(' ') || '')
              .replace(/\{\{phone\}\}/g, recipient.phone);

            const res = await fetch('/api/sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                userId: 1,
                to: recipient.phone,
                from: fromNumber,
                body: personalizedMessage,
                direction: 'outbound',
                campaignId: campaignId,
              }),
            });

            if (res.ok) sentCount++;
            else failedCount++;
            
            setSendingProgress({ sent: sentCount, failed: failedCount, total: recipientPhones.length });
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (e) {
            failedCount++;
            setSendingProgress({ sent: sentCount, failed: failedCount, total: recipientPhones.length });
          }
        }
      }

      // Update campaign status to completed
      if (campaignId) {
        await fetch(`/api/campaigns/sms-campaigns/${campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            status: 'completed',
            sentCount,
            failedCount,
            totalRecipients: recipientPhones.length,
          }),
        });
      }

      toast({
        title: 'Broadcast Complete',
        description: `Campaign "${createNewCampaign ? newCampaignName : 'Selected Campaign'}": Sent ${sentCount}, Failed ${failedCount}`,
      });

      // Refresh campaigns list
      fetchCampaigns();

      // Reset after a delay to show final progress
      setTimeout(() => {
        setShowBroadcastModal(false);
        setShowProgress(false);
        setBroadcastMessage('');
        setScheduleDate('');
        setScheduleTime('');
        setIsScheduled(false);
        setSelectedContacts(new Set());
        setIsSelectMode(false);
        setNewCampaignName('');
        setCreateNewCampaign(true);
        setSelectedCampaignId('');
        setSendingProgress({ sent: 0, failed: 0, total: 0 });
        setNumberSelectionMode('all'); // Reset to default all numbers mode
        setSelectedFromNumbers(new Set()); // Clear multi-select
      }, 2000);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send broadcast.', variant: 'destructive' });
      setShowProgress(false);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-50">
      {/* Left Sidebar - Conversation List */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Conversations</h2>
            <div className="flex items-center gap-1">
              <Button 
                variant={isSelectMode ? "default" : "ghost"} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  if (isSelectMode) setSelectedContacts(new Set());
                }}
                title="Select contacts"
              >
                <CheckSquare className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setShowBroadcastModal(true)}
                title="Broadcast message"
              >
                <Megaphone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchConversations()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Selection toolbar */}
          {isSelectMode && (
            <div className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg mb-3">
              <div className="flex items-center gap-2">
                <button onClick={selectAllContacts} className="text-blue-600 hover:text-blue-700">
                  {selectedContacts.size === filteredConversations.length ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
                <span className="text-sm font-medium text-blue-700">
                  {selectedContacts.size} selected
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  size="sm" 
                  variant="default"
                  className="h-7 bg-blue-600 hover:bg-blue-700"
                  onClick={() => setShowBroadcastModal(true)}
                  disabled={selectedContacts.size === 0}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="h-7"
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedContacts(new Set());
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-9">
              <TabsTrigger value="unread" className="text-xs px-2">
                <Mail className="h-3 w-3 mr-1" />Unread
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
              <TabsTrigger value="recents" className="text-xs px-2">
                <Clock className="h-3 w-3 mr-1" />Recents
              </TabsTrigger>
              <TabsTrigger value="starred" className="text-xs px-2">
                <Star className="h-3 w-3 mr-1" />Starred
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search conversations..." className="pl-9 h-9" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No conversations found</div>
          ) : (
            filteredConversations.map((conv) => (
              <div key={conv.id}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}
                  ${selectedContacts.has(conv.id) ? 'bg-blue-100' : ''}`}
                onClick={() => isSelectMode ? toggleSelectContact(conv.id) : handleSelectConversation(conv)}>
                <div className="flex items-start gap-3">
                  {/* Checkbox in select mode */}
                  {isSelectMode && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleSelectContact(conv.id); }}
                      className="mt-1 text-blue-600"
                    >
                      {selectedContacts.has(conv.id) ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </button>
                  )}
                  <div className="relative">
                    <Avatar className={`h-10 w-10 ${getAvatarColor(conv.contactName)}`}>
                      <AvatarFallback className="text-white text-sm">{getInitials(conv.contactName)}</AvatarFallback>
                    </Avatar>
                    {conv.unreadCount > 0 && !isSelectMode && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                        {conv.contactName}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatTime(conv.lastMessageTime)}</span>
                    </div>
                    <p className={`text-sm truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                      {conv.lastMessage}
                    </p>
                  </div>
                  {!isSelectMode && (
                    <button onClick={(e) => { e.stopPropagation(); toggleStar(conv.id); }} className="text-gray-400 hover:text-yellow-500">
                      <Star className={`h-4 w-4 ${conv.isStarred ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Center - Chat View */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConversation ? (
          <>
            <div className="h-16 border-b flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <Avatar className={`h-10 w-10 ${getAvatarColor(selectedConversation.contactName)}`}>
                  <AvatarFallback className="text-white">{getInitials(selectedConversation.contactName)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedConversation.contactName}</h3>
                  <p className="text-sm text-gray-500">{selectedConversation.contactPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon"><Bell className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon"><Phone className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon"><Copy className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon">
                  <Star className={`h-5 w-5 ${selectedConversation.isStarred ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                </Button>
                <Button variant="ghost" size="icon"><Archive className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon"><Trash2 className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(!showContactPanel)}>
                  <User className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {selectedConversation.messages.map((msg, idx) => {
                  const isOutbound = msg.direction === 'outbound';
                  const showDateSeparator = idx === 0 || 
                    new Date(msg.createdAt).toDateString() !== 
                    new Date(selectedConversation.messages[idx - 1].createdAt).toDateString();
                  
                  return (
                    <div key={msg.id}>
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-4">
                          <div className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                            {new Date(msg.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      )}
                      
                      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] ${isOutbound ? 'order-2' : ''}`}>
                          {!isOutbound && (
                            <div className="flex items-center gap-2 mb-1">
                              <Avatar className={`h-6 w-6 ${getAvatarColor(selectedConversation.contactName)}`}>
                                <AvatarFallback className="text-white text-xs">{getInitials(selectedConversation.contactName)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{selectedConversation.contactName}</span>
                              <span className="text-xs text-gray-500">{formatTime(msg.createdAt)}</span>
                            </div>
                          )}
                          
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            isOutbound ? 'bg-blue-500 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          </div>
                          
                          <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : ''}`}>
                            <span className="text-xs text-gray-500">{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span className="text-xs text-gray-500">
                                {msg.status === 'delivered' ? <CheckCircle2 className="h-3 w-3 text-green-500 inline" /> :
                                 msg.status === 'failed' ? <XCircle className="h-3 w-3 text-red-500 inline" /> :
                                 <CheckCircle2 className="h-3 w-3 text-gray-400 inline" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t p-4">
              {/* From number selector */}
              <div className="flex items-center gap-2 mb-2 max-w-3xl mx-auto">
                <span className="text-xs text-gray-500">From:</span>
                <select 
                  className="text-xs border rounded px-2 py-1 bg-white"
                  value={selectedFromNumber}
                  onChange={(e) => setSelectedFromNumber(e.target.value)}
                >
                  {phoneNumbers.length === 0 ? (
                    <option value="">No numbers available</option>
                  ) : (
                    phoneNumbers.map((pn) => (
                      <option key={pn.phoneNumber} value={pn.phoneNumber}>
                        {pn.phoneNumber} ({pn.provider || 'Unknown'})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon"><MessageSquare className="h-5 w-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Use Template</DropdownMenuItem>
                    <DropdownMenuItem>Schedule Message</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Input placeholder="Type a message..." className="flex-1" value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} />
                
                <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isSending || !selectedFromNumber} className="bg-teal-500 hover:bg-teal-600">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Contact Details */}
      {showContactPanel && selectedContact && (
        <div className="w-80 bg-white border-l flex flex-col h-full">
          <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
            <h3 className="font-semibold">Contact Details</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-4 overflow-y-auto flex-1">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className={`h-14 w-14 ${getAvatarColor(selectedContact.firstName + ' ' + selectedContact.lastName)}`}>
                <AvatarFallback className="text-white text-lg">
                  {getInitials(selectedContact.firstName + ' ' + selectedContact.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-semibold text-lg">{selectedContact.firstName} {selectedContact.lastName}</h4>
                <Button variant="link" className="h-auto p-0 text-blue-500">View full profile</Button>
              </div>
            </div>
            
            {/* Save to Contacts Button */}
            {!selectedContact.isSaved && (
              <Button 
                className="w-full mb-4 bg-green-600 hover:bg-green-700"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/contacts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        userId: 1,
                        firstName: selectedContact.firstName || null,
                        lastName: selectedContact.lastName || null,
                        phoneNumber: selectedContact.phone,
                        email: selectedContact.email || null,
                        birthday: selectedContact.birthday || null,
                        address: selectedContact.address || null,
                        city: selectedContact.city || null,
                        state: selectedContact.state || null,
                        zipCode: selectedContact.zipCode || null,
                        source: 'sms',
                      }),
                    });
                    if (res.ok) {
                      toast({ title: 'Contact Saved', description: 'Contact has been added to your contacts.' });
                      setSelectedContact({ ...selectedContact, isSaved: true });
                    } else {
                      throw new Error('Failed to save');
                    }
                  } catch (e) {
                    toast({ title: 'Error', description: 'Failed to save contact.', variant: 'destructive' });
                  }
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Save to Contacts
              </Button>
            )}
            {selectedContact.isSaved && (
              <div className="flex items-center gap-2 mb-4 p-2 bg-green-50 rounded-lg text-green-700 text-sm">
                <Check className="h-4 w-4" />
                Contact saved
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">Owner</p>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <User className="h-4 w-4 mr-2" />Unassigned<ChevronDown className="h-4 w-4 ml-auto" />
                </Button>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Followers</p>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <User className="h-4 w-4 mr-2" />Add<ChevronDown className="h-4 w-4 ml-auto" />
                </Button>
              </div>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Tags</p>
                <Button variant="ghost" size="sm" className="h-6 px-2"><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">SMS Lead</Badge>
                <Badge variant="secondary">Active</Badge>
              </div>
            </div>
            
            <Separator className="my-4" />
            
            <div className="space-y-4">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="all" className="text-xs">All Fields</TabsTrigger>
                  <TabsTrigger value="dnd" className="text-xs">DND</TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search Fields and Folders" className="pl-9 h-8 text-sm" />
              </div>
              
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">First Name</p>
                  <p className="font-medium">{selectedContact.firstName}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Last Name</p>
                  <p className="font-medium">{selectedContact.lastName}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Email</p>
                  <p className="font-medium text-blue-500">{selectedContact.email}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Phone</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇺🇸</span>
                    <p className="font-medium">{selectedContact.phone}</p>
                    <Badge variant="outline" className="ml-auto">Select</Badge>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Birthday</p>
                  <Input 
                    type="date" 
                    className="h-8 text-sm"
                    value={selectedContact.birthday || ''}
                    onChange={(e) => setSelectedContact({...selectedContact, birthday: e.target.value})}
                    placeholder="Select date"
                  />
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Address</p>
                  <Input 
                    className="h-8 text-sm mb-2"
                    value={selectedContact.address || ''}
                    onChange={(e) => setSelectedContact({...selectedContact, address: e.target.value})}
                    placeholder="Street address"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input 
                      className="h-8 text-sm"
                      value={selectedContact.city || ''}
                      onChange={(e) => setSelectedContact({...selectedContact, city: e.target.value})}
                      placeholder="City"
                    />
                    <Input 
                      className="h-8 text-sm"
                      value={selectedContact.state || ''}
                      onChange={(e) => setSelectedContact({...selectedContact, state: e.target.value})}
                      placeholder="State"
                    />
                  </div>
                  <Input 
                    className="h-8 text-sm mt-2"
                    value={selectedContact.zipCode || ''}
                    onChange={(e) => setSelectedContact({...selectedContact, zipCode: e.target.value})}
                    placeholder="ZIP Code"
                  />
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Source</p>
                  <p className="font-medium">{selectedContact.source || 'SMS Campaign'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-lg">Batch SMS Campaign</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => !isSending && setShowBroadcastModal(false)} disabled={isSending}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Progress Display */}
            {showProgress && (
              <div className="p-4 bg-blue-50 border-b">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-blue-800">Sending Messages...</span>
                  <span className="text-sm text-blue-600">
                    {sendingProgress.sent + sendingProgress.failed} / {sendingProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${sendingProgress.total > 0 ? ((sendingProgress.sent + sendingProgress.failed) / sendingProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-green-600">✓ Sent: {sendingProgress.sent}</span>
                  <span className="text-red-600">✗ Failed: {sendingProgress.failed}</span>
                </div>
              </div>
            )}
            
            <div className="p-4 space-y-4">
              {/* Campaign Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Campaign *</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setCreateNewCampaign(true)}
                    disabled={isSending}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      createNewCampaign ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <Plus className="h-4 w-4 inline mr-1" />
                    Create New Campaign
                  </button>
                  <button
                    onClick={() => setCreateNewCampaign(false)}
                    disabled={isSending}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      !createNewCampaign ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <ListPlus className="h-4 w-4 inline mr-1" />
                    Use Existing Campaign
                  </button>
                </div>
                
                {createNewCampaign ? (
                  <Input
                    placeholder="Enter campaign name (e.g., January Promo)"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    disabled={isSending}
                    className="w-full"
                  />
                ) : (
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    disabled={isSending}
                  >
                    <option value="">Select a campaign...</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} ({campaign.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              {/* Recipients */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Recipients</label>
                <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-700">{selectedContacts.size} contacts selected</span>
                  {selectedContacts.size === 0 && (
                    <span className="text-sm text-gray-500 ml-2">Select contacts from the list first</span>
                  )}
                </div>
              </div>
              
              {/* From Number */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">From Number *</label>
                
                {/* Number Selection Mode - 3 options like Twilio */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setNumberSelectionMode('all')}
                    disabled={isSending}
                    className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      numberSelectionMode === 'all' ? 'bg-green-50 border-green-300 text-green-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <RefreshCw className="h-3 w-3 inline mr-1" />
                    Use All Numbers
                  </button>
                  <button
                    onClick={() => setNumberSelectionMode('select')}
                    disabled={isSending}
                    className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      numberSelectionMode === 'select' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <CheckSquare className="h-3 w-3 inline mr-1" />
                    Select Multiple
                  </button>
                  <button
                    onClick={() => setNumberSelectionMode('single')}
                    disabled={isSending}
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
                      <RefreshCw className="h-5 w-5 text-green-600" />
                      <span className="font-medium text-green-800">All Numbers Pool Active</span>
                    </div>
                    <p className="text-sm text-green-700 mb-2">
                      Messages will rotate across all {phoneNumbers.length} available numbers.
                    </p>
                    {phoneNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const counts = phoneNumbers.reduce((acc: Record<string, number>, pn) => {
                            const provider = pn.provider || 'Unknown';
                            acc[provider] = (acc[provider] || 0) + 1;
                            return acc;
                          }, {});
                          return Object.entries(counts).map(([provider, count]) => (
                            <Badge 
                              key={provider} 
                              variant="outline" 
                              className={provider.toLowerCase() === 'twilio' ? 'border-red-300 text-red-600 bg-red-50' : 'border-blue-300 text-blue-600 bg-blue-50'}
                            >
                              {provider}: {count}
                            </Badge>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Multi-Select Mode */}
                {numberSelectionMode === 'select' && (
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Select numbers to use ({selectedFromNumbers.size} selected)
                      </span>
                      <button
                        onClick={() => {
                          if (selectedFromNumbers.size === phoneNumbers.length) {
                            setSelectedFromNumbers(new Set());
                          } else {
                            setSelectedFromNumbers(new Set(phoneNumbers.map(pn => pn.phoneNumber)));
                          }
                        }}
                        className="text-xs text-blue-600 hover:underline"
                        disabled={isSending}
                      >
                        {selectedFromNumbers.size === phoneNumbers.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {phoneNumbers.map((pn, idx) => (
                        <label 
                          key={idx} 
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50 ${
                            selectedFromNumbers.has(pn.phoneNumber) ? 'bg-blue-50' : ''
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
                            disabled={isSending}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{pn.phoneNumber}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${pn.provider?.toLowerCase() === 'twilio' ? 'border-red-200 text-red-600' : 'border-blue-200 text-blue-600'}`}
                          >
                            {pn.provider}
                          </Badge>
                          {pn.accountName && (
                            <span className="text-xs text-gray-500">• {pn.accountName}</span>
                          )}
                        </label>
                      ))}
                    </div>
                    {selectedFromNumbers.size > 0 && (
                      <div className="mt-2 pt-2 border-t text-xs text-gray-600">
                        Messages will rotate across {selectedFromNumbers.size} selected number{selectedFromNumbers.size > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}

                {/* Single Number Mode */}
                {numberSelectionMode === 'single' && (
                  <select 
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={selectedFromNumber}
                    onChange={(e) => setSelectedFromNumber(e.target.value)}
                    disabled={isSending}
                  >
                    <option value="">Select a phone number</option>
                    {(() => {
                      const grouped = phoneNumbers.reduce((acc: Record<string, any[]>, pn) => {
                        const provider = pn.provider || 'Unknown';
                        if (!acc[provider]) acc[provider] = [];
                        acc[provider].push(pn);
                        return acc;
                      }, {});
                      
                      return Object.entries(grouped).map(([provider, numbers]) => (
                        <optgroup key={provider} label={`━━ ${provider.toUpperCase()} ━━`}>
                          {numbers.map((pn: any, idx: number) => (
                            <option key={`${provider}-${idx}`} value={pn.phoneNumber}>
                              {pn.phoneNumber} {pn.accountName && `• ${pn.accountName}`}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                  </select>
                )}
              </div>
              
              {/* Message */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Message *</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px] resize-none"
                  placeholder="Hi {{firstName}}, your message here..."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Merge tags: {'{{firstName}}'}, {'{{lastName}}'}, {'{{phone}}'}
                  </p>
                  <p className="text-xs text-gray-500">{broadcastMessage.length} characters</p>
                </div>
              </div>
              
              {/* Schedule Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsScheduled(!isScheduled)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    isScheduled ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Schedule for later</span>
                </button>
                
                <button
                  onClick={() => setIsScheduled(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    !isScheduled ? 'bg-blue-50 border-blue-200 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <Zap className="h-4 w-4" />
                  <span className="text-sm font-medium">Send now</span>
                </button>
              </div>
              
              {/* Schedule Date/Time */}
              {isScheduled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Date</label>
                    <Input 
                      type="date" 
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Time</label>
                    <Input 
                      type="time" 
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBroadcastModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleBroadcastSend}
                disabled={isSending || !broadcastMessage.trim() || selectedContacts.size === 0 || !selectedFromNumber || (isScheduled && (!scheduleDate || !scheduleTime))}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSending ? (
                  <>Sending...</>
                ) : isScheduled ? (
                  <>
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Broadcast
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Broadcast
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}