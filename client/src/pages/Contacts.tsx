import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { 
  Search, Plus, Upload, Download, MoreHorizontal, Phone, Mail, User, 
  Tag, Trash2, Edit2, MessageSquare, X, Check, Filter, Users, RefreshCw,
  ChevronLeft, ChevronRight, UserPlus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '../components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Contact {
  id: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  tags: string[] | null;
  source: string | null;
  createdAt: string;
}

interface ConversationContact {
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageTime: string;
}

export default function Contacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showConversationsDialog, setShowConversationsDialog] = useState(false);
  
  // Form state
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    birthday: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    tags: '',
  });
  
  // Conversations state (for importing from SMS)
  const [conversationContacts, setConversationContacts] = useState<ConversationContact[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contacts/1`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContacts(data || []);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load contacts',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const res = await fetch('/api/conversations?limit=100', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const convContacts: ConversationContact[] = (data.conversations || []).map((conv: any) => ({
          phone: conv.contactPhone,
          name: conv.contactName || conv.contactPhone,
          lastMessage: conv.lastMessage || '',
          lastMessageTime: conv.lastMessageTime || '',
        }));
        
        // Filter out contacts that already exist
        const existingPhones = new Set(contacts.map(c => c.phoneNumber));
        const newConvContacts = convContacts.filter(c => !existingPhones.has(c.phone));
        
        setConversationContacts(newConvContacts);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContact.phoneNumber && !newContact.email) {
      toast({
        title: 'Error',
        description: 'Please provide at least a phone number or email',
        variant: 'destructive'
      });
      return;
    }

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: 1,
          firstName: newContact.firstName || null,
          lastName: newContact.lastName || null,
          phoneNumber: newContact.phoneNumber || null,
          email: newContact.email || null,
          birthday: newContact.birthday || null,
          address: newContact.address || null,
          city: newContact.city || null,
          state: newContact.state || null,
          zipCode: newContact.zipCode || null,
          tags: newContact.tags ? newContact.tags.split(',').map(t => t.trim()) : null,
          source: 'manual',
        }),
      });

      if (!res.ok) throw new Error('Failed to create contact');

      toast({
        title: 'Contact Added',
        description: `${newContact.firstName || 'Contact'} has been added`,
      });

      setShowAddDialog(false);
      setNewContact({ firstName: '', lastName: '', phoneNumber: '', email: '', birthday: '', address: '', city: '', state: '', zipCode: '', tags: '' });
      fetchContacts();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add contact',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;

    try {
      const res = await fetch(`/api/contacts/${editingContact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: editingContact.firstName,
          lastName: editingContact.lastName,
          phoneNumber: editingContact.phoneNumber,
          email: editingContact.email,
          tags: editingContact.tags,
        }),
      });

      if (!res.ok) throw new Error('Failed to update contact');

      toast({
        title: 'Contact Updated',
        description: 'Contact has been updated successfully',
      });

      setShowEditDialog(false);
      setEditingContact(null);
      fetchContacts();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update contact',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to delete contact');

      toast({
        title: 'Contact Deleted',
        description: 'Contact has been removed',
      });

      fetchContacts();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive'
      });
    }
  };

  const handleImportFromConversations = async () => {
    if (selectedConversations.size === 0) {
      toast({
        title: 'No Selection',
        description: 'Please select at least one conversation to import',
        variant: 'destructive'
      });
      return;
    }

    let imported = 0;
    let failed = 0;

    for (const phone of Array.from(selectedConversations)) {
      const conv = conversationContacts.find(c => c.phone === phone);
      if (!conv) continue;

      // Parse name from conversation
      let firstName = '';
      let lastName = '';
      
      if (conv.name && !conv.name.startsWith('+')) {
        const parts = conv.name.split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      try {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: 1,
            firstName: firstName || null,
            lastName: lastName || null,
            phoneNumber: phone,
            email: null,
            tags: ['imported-from-sms'],
          }),
        });

        if (res.ok) {
          imported++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }

    toast({
      title: 'Import Complete',
      description: `Imported ${imported} contacts${failed > 0 ? `, ${failed} failed` : ''}`,
    });

    setShowConversationsDialog(false);
    setSelectedConversations(new Set());
    fetchContacts();
  };

  const formatPhoneDisplay = (phone: string | null): string => {
    if (!phone) return '-';
    if (phone.startsWith('+1') && phone.length === 12) {
      return `+1 (${phone.substring(2, 5)}) ${phone.substring(5, 8)}-${phone.substring(8)}`;
    }
    return phone;
  };

  const getInitials = (firstName: string | null, lastName: string | null): string => {
    const f = firstName?.[0] || '';
    const l = lastName?.[0] || '';
    return (f + l).toUpperCase() || '?';
  };

  const getAvatarColor = (name: string): string => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500'];
    const index = Math.abs(name.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length;
    return colors[index];
  };

  // Filter and paginate contacts
  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.firstName?.toLowerCase().includes(query) ||
      contact.lastName?.toLowerCase().includes(query) ||
      contact.phoneNumber?.includes(query) ||
      contact.email?.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedContacts.size === paginatedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(paginatedContacts.map(c => c.id)));
    }
  };

  const toggleSelectContact = (id: number) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500">Manage your contacts and import from conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              setShowConversationsDialog(true);
              fetchConversations();
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Import from SMS
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Contacts</p>
                <p className="text-2xl font-bold">{contacts.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">With Phone</p>
                <p className="text-2xl font-bold">{contacts.filter(c => c.phoneNumber).length}</p>
              </div>
              <Phone className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">With Email</p>
                <p className="text-2xl font-bold">{contacts.filter(c => c.email).length}</p>
              </div>
              <Mail className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tagged</p>
                <p className="text-2xl font-bold">{contacts.filter(c => c.tags && c.tags.length > 0).length}</p>
              </div>
              <Tag className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={fetchContacts}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={selectedContacts.size === paginatedContacts.length && paginatedContacts.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    Loading contacts...
                  </TableCell>
                </TableRow>
              ) : paginatedContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    No contacts found. Add your first contact or import from SMS conversations.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedContacts.has(contact.id)}
                        onCheckedChange={() => toggleSelectContact(contact.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className={`h-9 w-9 ${getAvatarColor(contact.firstName || contact.phoneNumber || '')}`}>
                          <AvatarFallback className="text-white text-sm">
                            {getInitials(contact.firstName, contact.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {contact.firstName || contact.lastName 
                              ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                              : 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatPhoneDisplay(contact.phoneNumber)}</TableCell>
                    <TableCell>{contact.email || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {contact.tags?.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditingContact(contact);
                            setShowEditDialog(true);
                          }}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            if (contact.phoneNumber) {
                              window.location.href = `/sms?phone=${encodeURIComponent(contact.phoneNumber)}`;
                            }
                          }}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Send SMS
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeleteContact(contact.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredContacts.length)} of {filteredContacts.length}
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">Page {currentPage} of {totalPages}</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contact Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to your database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input 
                  value={newContact.firstName}
                  onChange={(e) => setNewContact({...newContact, firstName: e.target.value})}
                  placeholder="John"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input 
                  value={newContact.lastName}
                  onChange={(e) => setNewContact({...newContact, lastName: e.target.value})}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input 
                value={newContact.phoneNumber}
                onChange={(e) => setNewContact({...newContact, phoneNumber: e.target.value})}
                placeholder="+1234567890"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input 
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <Label>Birthday</Label>
              <Input 
                type="date"
                value={newContact.birthday}
                onChange={(e) => setNewContact({...newContact, birthday: e.target.value})}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input 
                value={newContact.address}
                onChange={(e) => setNewContact({...newContact, address: e.target.value})}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>City</Label>
                <Input 
                  value={newContact.city}
                  onChange={(e) => setNewContact({...newContact, city: e.target.value})}
                  placeholder="New York"
                />
              </div>
              <div>
                <Label>State</Label>
                <Input 
                  value={newContact.state}
                  onChange={(e) => setNewContact({...newContact, state: e.target.value})}
                  placeholder="NY"
                />
              </div>
            </div>
            <div>
              <Label>ZIP Code</Label>
              <Input 
                value={newContact.zipCode}
                onChange={(e) => setNewContact({...newContact, zipCode: e.target.value})}
                placeholder="10001"
              />
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input 
                value={newContact.tags}
                onChange={(e) => setNewContact({...newContact, tags: e.target.value})}
                placeholder="lead, customer, vip"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddContact}>Add Contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>
              Update contact information
            </DialogDescription>
          </DialogHeader>
          {editingContact && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input 
                    value={editingContact.firstName || ''}
                    onChange={(e) => setEditingContact({...editingContact, firstName: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input 
                    value={editingContact.lastName || ''}
                    onChange={(e) => setEditingContact({...editingContact, lastName: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input 
                  value={editingContact.phoneNumber || ''}
                  onChange={(e) => setEditingContact({...editingContact, phoneNumber: e.target.value})}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={editingContact.email || ''}
                  onChange={(e) => setEditingContact({...editingContact, email: e.target.value})}
                />
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input 
                  value={editingContact.tags?.join(', ') || ''}
                  onChange={(e) => setEditingContact({
                    ...editingContact, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)
                  })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateContact}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Conversations Dialog */}
      <Dialog open={showConversationsDialog} onOpenChange={setShowConversationsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Contacts from SMS Conversations</DialogTitle>
            <DialogDescription>
              Select conversations to add as contacts. Only new contacts (not already in your database) are shown.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-96">
            {isLoadingConversations ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                Loading conversations...
              </div>
            ) : conversationContacts.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                No new contacts to import. All conversation contacts are already in your database.
              </div>
            ) : (
              <div className="space-y-2 p-2">
                <div className="flex items-center justify-between mb-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (selectedConversations.size === conversationContacts.length) {
                        setSelectedConversations(new Set());
                      } else {
                        setSelectedConversations(new Set(conversationContacts.map(c => c.phone)));
                      }
                    }}
                  >
                    {selectedConversations.size === conversationContacts.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <span className="text-sm text-gray-500">
                    {selectedConversations.size} selected
                  </span>
                </div>
                {conversationContacts.map((conv) => (
                  <div 
                    key={conv.phone}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedConversations.has(conv.phone) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const newSelected = new Set(selectedConversations);
                      if (newSelected.has(conv.phone)) {
                        newSelected.delete(conv.phone);
                      } else {
                        newSelected.add(conv.phone);
                      }
                      setSelectedConversations(newSelected);
                    }}
                  >
                    <Checkbox checked={selectedConversations.has(conv.phone)} />
                    <Avatar className={`h-10 w-10 ${getAvatarColor(conv.name)}`}>
                      <AvatarFallback className="text-white">
                        {conv.name.startsWith('+') ? conv.phone.slice(-2) : conv.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{conv.name}</p>
                      <p className="text-sm text-gray-500">{formatPhoneDisplay(conv.phone)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{conv.lastMessage}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConversationsDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleImportFromConversations}
              disabled={selectedConversations.size === 0}
            >
              Import {selectedConversations.size} Contact{selectedConversations.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
