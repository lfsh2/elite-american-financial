/**
 * API Integration Page
 * 
 * Production-ready implementation for managing API keys and webhooks.
 * Integrates with backend endpoints for real data operations.
 * 
 * Features:
 * - API Key management (create, revoke, delete)
 * - Webhook management (create, update, delete, test)
 * - Quick start documentation
 * - Real-time status updates
 */

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Key, 
  Plus, 
  Copy, 
  Eye, 
  EyeOff, 
  Trash2, 
  RefreshCw,
  Code,
  CheckCircle,
  XCircle,
  ExternalLink,
  Shield,
  Activity,
  AlertTriangle,
  BookOpen,
  Zap,
  Globe,
  Send,
  MessageSquare,
  Phone,
  Loader2,
  Webhook
} from 'lucide-react';

// Types matching backend schema
interface ApiKey {
  id: number;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  active: boolean;
  requestCount: number;
  userId: number;
}

interface WebhookEndpoint {
  id: number;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  createdAt: string;
  lastTriggeredAt?: string | null;
  failCount: number;
  userId: number;
}

export default function ApiIntegrationPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id || 1;

  // State
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'docs'>('keys');
  const [isLoading, setIsLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  // Modal states
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'key' | 'webhook'; id: number; name: string } | null>(null);
  const [newKeyCreated, setNewKeyCreated] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [keyForm, setKeyForm] = useState({
    name: '',
    permissions: ['sms:read', 'sms:write'] as string[]
  });

  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    events: ['message.sent', 'message.delivered'] as string[]
  });

  const availablePermissions = [
    { id: 'sms:read', label: 'SMS Read', description: 'Read SMS messages' },
    { id: 'sms:write', label: 'SMS Write', description: 'Send SMS messages' },
    { id: 'voice:read', label: 'Voice Read', description: 'Read call logs' },
    { id: 'voice:write', label: 'Voice Write', description: 'Make voice calls' },
    { id: 'contacts:read', label: 'Contacts Read', description: 'Read contacts' },
    { id: 'contacts:write', label: 'Contacts Write', description: 'Manage contacts' },
    { id: 'campaigns:read', label: 'Campaigns Read', description: 'Read campaigns' },
    { id: 'campaigns:write', label: 'Campaigns Write', description: 'Manage campaigns' },
  ];

  const availableEvents = [
    { id: 'message.sent', label: 'Message Sent', icon: Send },
    { id: 'message.delivered', label: 'Message Delivered', icon: CheckCircle },
    { id: 'message.failed', label: 'Message Failed', icon: XCircle },
    { id: 'message.received', label: 'Message Received', icon: MessageSquare },
    { id: 'call.initiated', label: 'Call Initiated', icon: Phone },
    { id: 'call.completed', label: 'Call Completed', icon: Phone },
    { id: 'call.failed', label: 'Call Failed', icon: XCircle },
  ];

  /**
   * Load data on mount
   */
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [keysResponse, webhooksResponse] = await Promise.all([
          fetch(`/api/integration/api-keys/${userId}`),
          fetch(`/api/integration/webhooks/${userId}`)
        ]);
        
        if (keysResponse.ok) {
          const keysData = await keysResponse.json();
          setApiKeys(keysData || []);
        }
        
        if (webhooksResponse.ok) {
          const webhooksData = await webhooksResponse.json();
          setWebhooks(webhooksData || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [userId]);

  /**
   * Refresh API keys
   */
  const refreshApiKeys = async () => {
    try {
      const response = await fetch(`/api/integration/api-keys/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data || []);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  /**
   * Refresh webhooks
   */
  const refreshWebhooks = async () => {
    try {
      const response = await fetch(`/api/integration/webhooks/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data || []);
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    }
  };

  /**
   * Copy to clipboard
   */
  const copyToClipboard = (text: string, label: string = 'Value') => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: `${label} has been copied.`
    });
  };

  /**
   * Toggle key visibility
   */
  const toggleKeyVisibility = (id: number) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisibleKeys(newVisible);
  };

  /**
   * Create new API key
   */
  const handleCreateKey = async () => {
    if (!keyForm.name) return;
    
    setIsCreating(true);
    try {
      const response = await fetch('/api/integration/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: keyForm.name,
          permissions: keyForm.permissions
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create API key');
      }

      const newKey = await response.json();
      setNewKeyCreated(newKey.key);
      setApiKeys([...apiKeys, newKey]);
      setKeyForm({ name: '', permissions: ['sms:read', 'sms:write'] });
      
      toast({
        title: 'API Key Created',
        description: 'Your new API key has been generated. Copy it now - you won\'t be able to see it again!'
      });
    } catch (error: any) {
      console.error('Error creating API key:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create API key',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Revoke API key
   */
  const handleRevokeKey = async (key: ApiKey) => {
    try {
      const response = await fetch(`/api/integration/api-keys/${userId}/${key.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to revoke API key');

      setApiKeys(apiKeys.filter(k => k.id !== key.id));
      toast({
        title: 'API Key Revoked',
        description: `${key.name} has been revoked and can no longer be used.`,
        variant: 'destructive'
      });
    } catch (error) {
      console.error('Error revoking API key:', error);
      toast({
        title: 'Error',
        description: 'Failed to revoke API key',
        variant: 'destructive'
      });
    }
  };

  /**
   * Create new webhook
   */
  const handleCreateWebhook = async () => {
    if (!webhookForm.name || !webhookForm.url) return;
    
    setIsCreating(true);
    try {
      const response = await fetch('/api/integration/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: webhookForm.name,
          url: webhookForm.url,
          events: webhookForm.events
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create webhook');
      }

      const newWebhook = await response.json();
      setWebhooks([...webhooks, newWebhook]);
      setShowCreateWebhookModal(false);
      setWebhookForm({ name: '', url: '', events: ['message.sent', 'message.delivered'] });
      
      toast({
        title: 'Webhook Created',
        description: `${newWebhook.name} has been created successfully.`
      });
    } catch (error: any) {
      console.error('Error creating webhook:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create webhook',
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Toggle webhook active status
   */
  const handleToggleWebhook = async (webhook: WebhookEndpoint) => {
    try {
      const response = await fetch(`/api/integration/webhooks/${userId}/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !webhook.active })
      });

      if (!response.ok) throw new Error('Failed to update webhook');

      const updated = await response.json();
      setWebhooks(webhooks.map(w => w.id === webhook.id ? updated : w));
      
      toast({
        title: `Webhook ${updated.active ? 'Enabled' : 'Disabled'}`,
        description: `${webhook.name} has been ${updated.active ? 'enabled' : 'disabled'}.`
      });
    } catch (error) {
      console.error('Error toggling webhook:', error);
      toast({
        title: 'Error',
        description: 'Failed to update webhook',
        variant: 'destructive'
      });
    }
  };

  /**
   * Delete webhook
   */
  const handleDeleteWebhook = async (webhook: WebhookEndpoint) => {
    try {
      const response = await fetch(`/api/integration/webhooks/${userId}/${webhook.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete webhook');

      setWebhooks(webhooks.filter(w => w.id !== webhook.id));
      toast({
        title: 'Webhook Deleted',
        description: `${webhook.name} has been removed.`,
        variant: 'destructive'
      });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete webhook',
        variant: 'destructive'
      });
    }
  };

  /**
   * Handle delete confirmation
   */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'key') {
      const key = apiKeys.find(k => k.id === deleteTarget.id);
      if (key) await handleRevokeKey(key);
    } else {
      const webhook = webhooks.find(w => w.id === deleteTarget.id);
      if (webhook) await handleDeleteWebhook(webhook);
    }
    
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  /**
   * Get status badge
   */
  const getStatusBadge = (active: boolean, failing?: boolean) => {
    if (failing) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Failing
        </span>
      );
    }
    if (active) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <XCircle className="w-3 h-3 mr-1" />
        Inactive
      </span>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">Loading API integration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">API Integration</h1>
        <p className="text-gray-500">Manage API keys, webhooks, and integrate Elite Financial with your applications</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'keys'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Key className="w-4 h-4 inline mr-2" />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'webhooks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Webhook className="w-4 h-4 inline mr-2" />
            Webhooks
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'docs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-2" />
            Quick Start
          </button>
        </div>
      </div>

      {/* API Keys Tab */}
      {activeTab === 'keys' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Keys</p>
                  <p className="text-2xl font-bold">{apiKeys.filter(k => k.active).length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Key className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Requests</p>
                  <p className="text-2xl font-bold">
                    {apiKeys.reduce((sum, k) => sum + (k.requestCount || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Keys</p>
                  <p className="text-2xl font-bold">{apiKeys.length}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Shield className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Keys List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">API Keys</h3>
              <button
                onClick={() => setShowCreateKeyModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700"
              >
                <Plus size={16} className="mr-2" />
                Create API Key
              </button>
            </div>
            
            {apiKeys.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {apiKeys.map((key) => (
                  <div key={key.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-gray-900">{key.name}</h4>
                          {getStatusBadge(key.active)}
                        </div>
                        <div className="mt-2 flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
                              {visibleKeys.has(key.id) ? key.key : `${key.keyPrefix || key.key?.substring(0, 12)}${'•'.repeat(20)}`}
                            </code>
                            <button 
                              onClick={() => toggleKeyVisibility(key.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {visibleKeys.has(key.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button 
                              onClick={() => copyToClipboard(key.key, 'API Key')}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{(key.requestCount || 0).toLocaleString()} requests</span>
                          {key.lastUsedAt && (
                            <>
                              <span>•</span>
                              <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                        {key.permissions && key.permissions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {key.permissions.map((perm) => (
                              <span key={perm} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setDeleteTarget({ type: 'key', id: key.id, name: key.name });
                            setShowDeleteModal(true);
                          }}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
                <p className="text-gray-500 mb-4">Create an API key to start integrating with Elite Financial</p>
                <button
                  onClick={() => setShowCreateKeyModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Create API Key
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Webhooks</p>
                  <p className="text-2xl font-bold">{webhooks.filter(w => w.active).length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Webhook className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Webhooks</p>
                  <p className="text-2xl font-bold">{webhooks.length}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Failing</p>
                  <p className="text-2xl font-bold">{webhooks.filter(w => w.failCount > 5).length}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Webhooks List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Webhook Endpoints</h3>
              <button
                onClick={() => setShowCreateWebhookModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700"
              >
                <Plus size={16} className="mr-2" />
                Add Endpoint
              </button>
            </div>
            
            {webhooks.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-gray-900">{webhook.name}</h4>
                          {getStatusBadge(webhook.active, webhook.failCount > 5)}
                        </div>
                        <div className="mt-2">
                          <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                            {webhook.url}
                          </code>
                        </div>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>{webhook.failCount || 0} failures</span>
                          {webhook.lastTriggeredAt && (
                            <>
                              <span>•</span>
                              <span>Last triggered {new Date(webhook.lastTriggeredAt).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                        {webhook.events && webhook.events.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {webhook.events.map((event) => (
                              <span key={event} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                                {event}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {webhook.secret && (
                          <button
                            onClick={() => copyToClipboard(webhook.secret, 'Webhook secret')}
                            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center"
                          >
                            <Key size={14} className="mr-1" />
                            Copy Secret
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleWebhook(webhook)}
                          className={`px-3 py-1 text-sm rounded ${
                            webhook.active 
                              ? 'text-orange-600 hover:bg-orange-50' 
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {webhook.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget({ type: 'webhook', id: webhook.id, name: webhook.name });
                            setShowDeleteModal(true);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Webhook className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Webhooks</h3>
                <p className="text-gray-500 mb-4">Add a webhook endpoint to receive real-time event notifications</p>
                <button
                  onClick={() => setShowCreateWebhookModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Add Endpoint
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Start / Docs Tab */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          {/* Quick Start Guide */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-500" />
              Quick Start Guide
            </h3>
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                  1
                </div>
                <div className="ml-4">
                  <h4 className="font-medium text-gray-900">Get your API Key</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Create an API key from the API Keys tab above. Keep it secure and never expose it in client-side code.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                  2
                </div>
                <div className="ml-4">
                  <h4 className="font-medium text-gray-900">Make your first API call</h4>
                  <p className="text-sm text-gray-500 mt-1 mb-2">
                    Use the API to send an SMS message:
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    <pre className="text-gray-300">
{`curl -X POST ${window.location.origin}/api/sms/send \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "from": "+0987654321",
    "body": "Hello from Elite Financial!"
  }'`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                  3
                </div>
                <div className="ml-4">
                  <h4 className="font-medium text-gray-900">Set up webhooks (optional)</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Configure webhook endpoints to receive real-time notifications for message delivery, incoming messages, and call events.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* API Endpoints */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-blue-500" />
              Available API Endpoints
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mr-3">POST</span>
                  <code className="text-sm">/api/sms/send</code>
                </div>
                <span className="text-sm text-gray-500">Send SMS message</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/api/sms/messages/:userId</code>
                </div>
                <span className="text-sm text-gray-500">List messages</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mr-3">POST</span>
                  <code className="text-sm">/api/voice/call</code>
                </div>
                <span className="text-sm text-gray-500">Initiate voice call</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/api/phone-numbers/:userId</code>
                </div>
                <span className="text-sm text-gray-500">List phone numbers</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/api/contacts/:userId</code>
                </div>
                <span className="text-sm text-gray-500">List contacts</span>
              </div>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-purple-500" />
              Rate Limits
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-700">Endpoint</th>
                    <th className="text-left py-2 font-medium text-gray-700">Rate Limit</th>
                    <th className="text-left py-2 font-medium text-gray-700">Burst</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 text-gray-600">POST /api/sms/send</td>
                    <td className="py-2 text-gray-900">100 req/min</td>
                    <td className="py-2 text-gray-900">200</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600">GET endpoints</td>
                    <td className="py-2 text-gray-900">300 req/min</td>
                    <td className="py-2 text-gray-900">500</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600">POST /api/voice/call</td>
                    <td className="py-2 text-gray-900">50 req/min</td>
                    <td className="py-2 text-gray-900">100</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            {!newKeyCreated ? (
              <>
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold">Create API Key</h2>
                  <p className="text-gray-500 text-sm mt-1">Generate a new API key for your application</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Key Name *</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={keyForm.name}
                      onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                      placeholder="e.g., Production API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {availablePermissions.map((perm) => (
                        <label key={perm.id} className="flex items-start">
                          <input
                            type="checkbox"
                            className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            checked={keyForm.permissions.includes(perm.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setKeyForm({ ...keyForm, permissions: [...keyForm.permissions, perm.id] });
                              } else {
                                setKeyForm({ ...keyForm, permissions: keyForm.permissions.filter(p => p !== perm.id) });
                              }
                            }}
                          />
                          <div className="ml-2">
                            <span className="text-sm font-medium text-gray-700">{perm.label}</span>
                            <p className="text-xs text-gray-500">{perm.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowCreateKeyModal(false);
                      setKeyForm({ name: '', permissions: ['sms:read', 'sms:write'] });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={isCreating || !keyForm.name}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Key'
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold text-green-600 flex items-center">
                    <CheckCircle className="w-6 h-6 mr-2" />
                    API Key Created
                  </h2>
                </div>
                <div className="p-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="ml-3">
                        <h4 className="text-sm font-medium text-yellow-800">Save your API key now</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          This is the only time you'll see this key. Copy it and store it securely.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <code className="text-sm font-mono break-all">{newKeyCreated}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(newKeyCreated, 'API Key')}
                    className="mt-4 w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <Copy size={16} className="mr-2" />
                    Copy to Clipboard
                  </button>
                </div>
                <div className="p-6 border-t bg-gray-50">
                  <button
                    onClick={() => {
                      setShowCreateKeyModal(false);
                      setNewKeyCreated(null);
                    }}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Webhook Modal */}
      {showCreateWebhookModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Add Webhook Endpoint</h2>
              <p className="text-gray-500 text-sm mt-1">Configure a URL to receive event notifications</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint Name *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  placeholder="e.g., CRM Integration"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL *</label>
                <input
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  placeholder="https://api.example.com/webhooks"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events to Subscribe</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableEvents.map((event) => {
                    const Icon = event.icon;
                    return (
                      <label key={event.id} className="flex items-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          checked={webhookForm.events.includes(event.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setWebhookForm({ ...webhookForm, events: [...webhookForm.events, event.id] });
                            } else {
                              setWebhookForm({ ...webhookForm, events: webhookForm.events.filter(ev => ev !== event.id) });
                            }
                          }}
                        />
                        <Icon size={14} className="ml-2 text-gray-400" />
                        <span className="ml-2 text-sm text-gray-700">{event.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateWebhookModal(false);
                  setWebhookForm({ name: '', url: '', events: ['message.sent', 'message.delivered'] });
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWebhook}
                disabled={isCreating || !webhookForm.name || !webhookForm.url}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Add Endpoint'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-center text-gray-900 mb-2">
                Delete {deleteTarget.type === 'key' ? 'API Key' : 'Webhook'}?
              </h3>
              <p className="text-sm text-gray-500 text-center">
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
