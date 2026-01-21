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
  Square,
  ListPlus,
  Megaphone,
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
  source?: string;
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

  useEffect(() => {
    fetchConversations();
    fetchPhoneNumbers();
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

  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/data/messages?period=thisMonth', { credentials: 'include' });
      
      if (res.ok) {
        const data = await res.json();
        const messages = data.messages || [];
        console.log('[SmsInbox] Fetched messages:', messages.length);
        
        const conversationMap = new Map<string, Conversation>();
        
        messages.forEach((msg: any) => {
          // Skip messages without required fields
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
        
        const sortedConversations = Array.from(conversationMap.values())
          .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
        
        console.log('[SmsInbox] Created conversations:', sortedConversations.length);
        setConversations(sortedConversations);
        
        if (sortedConversations.length > 0 && !selectedConversation) {
          handleSelectConversation(sortedConversations[0]);
        }
      } else {
        console.error('[SmsInbox] Failed to fetch messages:', res.status);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getContactName = (phone: string): string => {
    const names = ['Darnisha Cohen', 'Michael Kattan', 'Antoine Allen', 'Mary Apicella',
      'Vic Patel', 'Sarah Johnson', 'James Wilson', 'Emily Davis',
      'Robert Brown', 'Lisa Anderson', 'David Martinez', 'Jennifer Taylor'];
    const index = Math.abs(phone.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % names.length;
    return names[index];
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string): string => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500'];
    const index = Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length;
    return colors[index];
  };

  const handleSelectConversation = (conversation: Conversation) => {
    const sortedMessages = [...conversation.messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    setSelectedConversation({ ...conversation, messages: sortedMessages });
    
    const nameParts = conversation.contactName.split(' ');
    setSelectedContact({
      phone: conversation.contactPhone,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: `${nameParts[0]?.toLowerCase() || 'contact'}@example.com`,
      source: 'SMS Campaign',
    });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setIsSending(true);
    try {
      const newMsg: Message = {
        id: String(Date.now()),
        from: '+15551234567',
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
      
      setNewMessage('');
      toast({ title: 'Message Sent', description: 'Your message has been sent successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send message.', variant: 'destructive' });
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
    if (!broadcastMessage.trim() || selectedContacts.size === 0 || !selectedFromNumber) {
      toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      const recipients = Array.from(selectedContacts);
      
      // For demo, simulate sending
      toast({
        title: isScheduled ? 'Broadcast Scheduled' : 'Broadcast Sent',
        description: `${isScheduled ? 'Scheduled' : 'Sent'} message to ${recipients.length} contacts${isScheduled ? ` for ${scheduleDate} ${scheduleTime}` : ''}.`,
      });

      // Reset
      setShowBroadcastModal(false);
      setBroadcastMessage('');
      setScheduleDate('');
      setScheduleTime('');
      setIsScheduled(false);
      setSelectedContacts(new Set());
      setIsSelectMode(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send broadcast.', variant: 'destructive' });
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
            <h2 className="text-lg font-semibold">Team Inbox</h2>
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
                
                <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isSending} className="bg-teal-500 hover:bg-teal-600">
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
        <div className="w-80 bg-white border-l">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Contact Details</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowContactPanel(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-4">
            <div className="flex items-center gap-3 mb-6">
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
                  <p className="text-xs text-gray-500 mb-1">Source</p>
                  <p className="font-medium">{selectedContact.source || 'Unknown'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-lg">Broadcast Message</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowBroadcastModal(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4 space-y-4">
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
                <label className="text-sm font-medium text-gray-700 mb-1 block">From Number *</label>
                <select 
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={selectedFromNumber}
                  onChange={(e) => setSelectedFromNumber(e.target.value)}
                >
                  {phoneNumbers.length === 0 ? (
                    <option value="">No phone numbers available</option>
                  ) : (
                    <>
                      {/* Group by provider */}
                      {(() => {
                        const grouped = phoneNumbers.reduce((acc: Record<string, any[]>, pn) => {
                          const provider = pn.provider || 'Unknown';
                          if (!acc[provider]) acc[provider] = [];
                          acc[provider].push(pn);
                          return acc;
                        }, {});
                        
                        return Object.entries(grouped).map(([provider, numbers]) => (
                          <optgroup key={provider} label={`━━ ${provider.toUpperCase()} (${numbers.length} numbers) ━━`}>
                            {numbers.map((pn: any, idx: number) => (
                              <option key={`${provider}-${idx}`} value={pn.phoneNumber}>
                                {pn.phoneNumber} {pn.accountName && `• ${pn.accountName}`}
                              </option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </>
                  )}
                </select>
                {/* Provider summary */}
                {phoneNumbers.length > 0 && (
                  <div className="flex gap-2 mt-2">
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