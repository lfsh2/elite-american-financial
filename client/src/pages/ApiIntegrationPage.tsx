import React, { useState } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { 
  Key, 
  Plus, 
  Copy, 
  Eye, 
  EyeOff, 
  Trash2, 
  RefreshCw,
  Webhook,
  Code,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Settings,
  Shield,
  Activity,
  AlertTriangle,
  BookOpen,
  Terminal,
  Zap,
  Globe,
  Send,
  MessageSquare,
  Phone,
  Mail
} from 'lucide-react';

interface ApiKey {
  id: number;
  name: string;
  key: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsed: string | null;
  status: 'active' | 'revoked';
  requestCount: number;
}

interface WebhookEndpoint {
  id: number;
  name: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive' | 'failing';
  secret: string;
  createdAt: string;
  lastTriggered: string | null;
  successRate: number;
  failCount: number;
}

export default function ApiIntegrationPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'docs'>('keys');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'key' | 'webhook'; id: number; name: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [newKeyCreated, setNewKeyCreated] = useState<string | null>(null);

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

  // Mock API keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    {
      id: 1,
      name: 'Production API Key',
      key: 'sk_live_abc123def456ghi789jkl012mno345pqr678',
      prefix: 'sk_live_abc1',
      permissions: ['sms:read', 'sms:write', 'voice:read', 'voice:write', 'contacts:read', 'contacts:write'],
      createdAt: '2024-06-15T10:30:00Z',
      lastUsed: '2025-05-12T14:30:00Z',
      status: 'active',
      requestCount: 125430
    },
    {
      id: 2,
      name: 'Development Key',
      key: 'sk_test_xyz789abc123def456ghi789jkl012mno',
      prefix: 'sk_test_xyz7',
      permissions: ['sms:read', 'sms:write'],
      createdAt: '2024-08-20T09:15:00Z',
      lastUsed: '2025-05-10T11:20:00Z',
      status: 'active',
      requestCount: 8542
    },
    {
      id: 3,
      name: 'Legacy Integration',
      key: 'sk_live_old123legacy456key789revoked012',
      prefix: 'sk_live_old1',
      permissions: ['sms:read'],
      createdAt: '2024-01-10T08:00:00Z',
      lastUsed: '2024-12-15T16:45:00Z',
      status: 'revoked',
      requestCount: 45230
    }
  ]);

  // Mock webhooks
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([
    {
      id: 1,
      name: 'CRM Integration',
      url: 'https://api.mycrm.com/webhooks/unicomms',
      events: ['message.sent', 'message.delivered', 'message.failed'],
      status: 'active',
      secret: 'whsec_abc123def456',
      createdAt: '2024-06-15T10:30:00Z',
      lastTriggered: '2025-05-12T14:30:00Z',
      successRate: 99.8,
      failCount: 2
    },
    {
      id: 2,
      name: 'Analytics Webhook',
      url: 'https://analytics.example.com/events',
      events: ['message.sent', 'call.completed'],
      status: 'active',
      secret: 'whsec_xyz789ghi012',
      createdAt: '2024-09-01T12:00:00Z',
      lastTriggered: '2025-05-12T16:45:00Z',
      successRate: 100,
      failCount: 0
    },
    {
      id: 3,
      name: 'Backup System',
      url: 'https://backup.internal.com/webhook',
      events: ['message.sent'],
      status: 'failing',
      secret: 'whsec_fail123test456',
      createdAt: '2024-11-15T09:00:00Z',
      lastTriggered: '2025-05-11T08:00:00Z',
      successRate: 45.2,
      failCount: 156
    }
  ]);

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

  const copyToClipboard = (text: string, label: string = 'Value') => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: `${label} has been copied.`
    });
  };

  const toggleKeyVisibility = (id: number) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisibleKeys(newVisible);
  };

  const handleCreateKey = () => {
    const newKey = `sk_live_${Math.random().toString(36).substring(2, 38)}`;
    const newApiKey: ApiKey = {
      id: Math.max(...apiKeys.map(k => k.id)) + 1,
      name: keyForm.name,
      key: newKey,
      prefix: newKey.substring(0, 12),
      permissions: keyForm.permissions,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      status: 'active',
      requestCount: 0
    };
    setApiKeys([...apiKeys, newApiKey]);
    setNewKeyCreated(newKey);
    setKeyForm({ name: '', permissions: ['sms:read', 'sms:write'] });
  };

  const handleCreateWebhook = () => {
    const newWebhook: WebhookEndpoint = {
      id: Math.max(...webhooks.map(w => w.id)) + 1,
      name: webhookForm.name,
      url: webhookForm.url,
      events: webhookForm.events,
      status: 'active',
      secret: `whsec_${Math.random().toString(36).substring(2, 18)}`,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      successRate: 100,
      failCount: 0
    };
    setWebhooks([...webhooks, newWebhook]);
    setShowCreateWebhookModal(false);
    setWebhookForm({ name: '', url: '', events: ['message.sent', 'message.delivered'] });
    toast({
      title: 'Webhook created',
      description: `${newWebhook.name} has been created successfully.`
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'key') {
      setApiKeys(apiKeys.filter(k => k.id !== deleteTarget.id));
    } else {
      setWebhooks(webhooks.filter(w => w.id !== deleteTarget.id));
    }
    toast({
      title: `${deleteTarget.type === 'key' ? 'API Key' : 'Webhook'} deleted`,
      description: `${deleteTarget.name} has been removed.`,
      variant: 'destructive'
    });
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleRevokeKey = (key: ApiKey) => {
    setApiKeys(apiKeys.map(k => 
      k.id === key.id ? { ...k, status: 'revoked' as const } : k
    ));
    toast({
      title: 'API Key revoked',
      description: `${key.name} has been revoked and can no longer be used.`,
      variant: 'destructive'
    });
  };

  const handleToggleWebhook = (webhook: WebhookEndpoint) => {
    const newStatus = webhook.status === 'active' ? 'inactive' : 'active';
    setWebhooks(webhooks.map(w => 
      w.id === webhook.id ? { ...w, status: newStatus as 'active' | 'inactive' } : w
    ));
    toast({
      title: `Webhook ${newStatus}`,
      description: `${webhook.name} has been ${newStatus === 'active' ? 'enabled' : 'disabled'}.`
    });
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
      case 'revoked':
      case 'inactive':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <XCircle className="w-3 h-3 mr-1" />
            {status === 'revoked' ? 'Revoked' : 'Inactive'}
          </span>
        );
      case 'failing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Failing
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">API Integration</h1>
        <p className="text-gray-500">Manage API keys, webhooks, and integrate SyncGrid with your applications</p>
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
                  <p className="text-2xl font-bold">{apiKeys.filter(k => k.status === 'active').length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Key className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Requests (30d)</p>
                  <p className="text-2xl font-bold">{apiKeys.reduce((sum, k) => sum + k.requestCount, 0).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Revoked Keys</p>
                  <p className="text-2xl font-bold">{apiKeys.filter(k => k.status === 'revoked').length}</p>
                </div>
                <div className="p-3 bg-gray-100 rounded-full">
                  <Shield className="w-6 h-6 text-gray-600" />
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
            <div className="divide-y divide-gray-200">
              {apiKeys.map((key) => (
                <div key={key.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{key.name}</h4>
                        {getStatusBadge(key.status)}
                      </div>
                      <div className="mt-2 flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
                            {visibleKeys.has(key.id) ? key.key : `${key.prefix}${'•'.repeat(24)}`}
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
                        <span>{key.requestCount.toLocaleString()} requests</span>
                        {key.lastUsed && (
                          <>
                            <span>•</span>
                            <span>Last used {new Date(key.lastUsed).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {key.permissions.map((perm) => (
                          <span key={perm} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {key.status === 'active' && (
                        <button
                          onClick={() => handleRevokeKey(key)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDeleteTarget({ type: 'key', id: key.id, name: key.name });
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
                  <p className="text-2xl font-bold">{webhooks.filter(w => w.status === 'active').length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Webhook className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Avg Success Rate</p>
                  <p className="text-2xl font-bold">
                    {(webhooks.reduce((sum, w) => sum + w.successRate, 0) / webhooks.length).toFixed(1)}%
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
                  <p className="text-sm text-gray-500">Failing Webhooks</p>
                  <p className="text-2xl font-bold">{webhooks.filter(w => w.status === 'failing').length}</p>
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
            <div className="divide-y divide-gray-200">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h4 className="font-medium text-gray-900">{webhook.name}</h4>
                        {getStatusBadge(webhook.status)}
                      </div>
                      <div className="mt-2">
                        <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {webhook.url}
                        </code>
                      </div>
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                        <span>Success rate: {webhook.successRate}%</span>
                        <span>•</span>
                        <span>{webhook.failCount} failures</span>
                        {webhook.lastTriggered && (
                          <>
                            <span>•</span>
                            <span>Last triggered {new Date(webhook.lastTriggered).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {webhook.events.map((event) => (
                          <span key={event} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyToClipboard(webhook.secret, 'Webhook secret')}
                        className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center"
                      >
                        <Key size={14} className="mr-1" />
                        Copy Secret
                      </button>
                      <button
                        onClick={() => handleToggleWebhook(webhook)}
                        className={`px-3 py-1 text-sm rounded ${
                          webhook.status === 'active' 
                            ? 'text-orange-600 hover:bg-orange-50' 
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {webhook.status === 'active' ? 'Disable' : 'Enable'}
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
                  <h4 className="font-medium text-gray-900">Install the SDK (Optional)</h4>
                  <p className="text-sm text-gray-500 mt-1 mb-2">
                    Install our official SDK for your preferred language:
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                    <div className="text-gray-400"># Node.js</div>
                    <div className="text-green-400">npm install @unicomms/sdk</div>
                    <div className="text-gray-400 mt-2"># Python</div>
                    <div className="text-green-400">pip install unicomms</div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                  3
                </div>
                <div className="ml-4">
                  <h4 className="font-medium text-gray-900">Send your first message</h4>
                  <p className="text-sm text-gray-500 mt-1 mb-2">
                    Use the API to send an SMS message:
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                    <pre className="text-gray-300">
{`curl -X POST https://api.unicomms.io/v1/messages \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "from": "+0987654321",
    "body": "Hello from SyncGrid!"
  }'`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* API Endpoints */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-blue-500" />
              API Endpoints
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mr-3">POST</span>
                  <code className="text-sm">/v1/messages</code>
                </div>
                <span className="text-sm text-gray-500">Send SMS message</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/v1/messages</code>
                </div>
                <span className="text-sm text-gray-500">List messages</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mr-3">POST</span>
                  <code className="text-sm">/v1/calls</code>
                </div>
                <span className="text-sm text-gray-500">Initiate voice call</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/v1/phone-numbers</code>
                </div>
                <span className="text-sm text-gray-500">List phone numbers</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded mr-3">GET</span>
                  <code className="text-sm">/v1/contacts</code>
                </div>
                <span className="text-sm text-gray-500">List contacts</span>
              </div>
            </div>
            <div className="mt-4">
              <a 
                href="#" 
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
              >
                View full API documentation
                <ExternalLink size={14} className="ml-1" />
              </a>
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
                    <td className="py-2 text-gray-600">POST /v1/messages</td>
                    <td className="py-2 text-gray-900">100 req/min</td>
                    <td className="py-2 text-gray-900">200</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600">GET /v1/messages</td>
                    <td className="py-2 text-gray-900">300 req/min</td>
                    <td className="py-2 text-gray-900">500</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600">POST /v1/calls</td>
                    <td className="py-2 text-gray-900">50 req/min</td>
                    <td className="py-2 text-gray-900">100</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-gray-600">All other endpoints</td>
                    <td className="py-2 text-gray-900">500 req/min</td>
                    <td className="py-2 text-gray-900">1000</td>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
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
                        <label key={perm.id} className="flex items-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            checked={keyForm.permissions.includes(perm.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setKeyForm({ ...keyForm, permissions: [...keyForm.permissions, perm.id] });
                              } else {
                                setKeyForm({ ...keyForm, permissions: keyForm.permissions.filter(p => p !== perm.id) });
                              }
                            }}
                          />
                          <span className="ml-2 text-sm text-gray-700">{perm.label}</span>
                          <span className="ml-2 text-xs text-gray-400">- {perm.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
                  <button
                    onClick={() => { setShowCreateKeyModal(false); setKeyForm({ name: '', permissions: ['sms:read', 'sms:write'] }); }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!keyForm.name || keyForm.permissions.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create Key
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 border-b">
                  <h2 className="text-xl font-semibold flex items-center">
                    <CheckCircle className="w-6 h-6 text-green-500 mr-2" />
                    API Key Created
                  </h2>
                </div>
                <div className="p-6">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="flex">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <div className="ml-3">
                        <h4 className="text-sm font-medium text-yellow-800">Save your API key now</h4>
                        <p className="text-sm text-yellow-700 mt-1">
                          This is the only time you'll see this key. Make sure to copy and store it securely.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono break-all">{newKeyCreated}</code>
                      <button
                        onClick={() => copyToClipboard(newKeyCreated, 'API Key')}
                        className="ml-3 p-2 text-gray-500 hover:text-gray-700 flex-shrink-0"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end">
                  <button
                    onClick={() => { setShowCreateKeyModal(false); setNewKeyCreated(null); }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  placeholder="e.g., CRM Integration"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  placeholder="https://your-server.com/webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events to Listen</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableEvents.map((event) => (
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
                      <event.icon className="w-4 h-4 ml-2 text-gray-400" />
                      <span className="ml-2 text-sm text-gray-700">{event.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => { setShowCreateWebhookModal(false); setWebhookForm({ name: '', url: '', events: ['message.sent', 'message.delivered'] }); }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWebhook}
                disabled={!webhookForm.name || !webhookForm.url || webhookForm.events.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add Endpoint
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
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-center mb-2">
                Delete {deleteTarget.type === 'key' ? 'API Key' : 'Webhook'}
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? 
                This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}