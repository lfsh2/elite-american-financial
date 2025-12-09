import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useTwilioAnalytics, formatPhoneNumber, formatNumber } from '../hooks/useTwilioData';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Filter, 
  Phone, 
  ChevronDown,
  Table2,
  BarChart3,
  Settings,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

export default function Messaging() {
  const { user } = useAuth();
  const { analytics, loading, error, refresh } = useTwilioAnalytics();
  const [activeTab, setActiveTab] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  // Real messages from Twilio
  const messages = analytics?.messages.thisMonth || [];
  const inboundMessages = messages.filter(m => m.direction === 'inbound');
  const outboundMessages = messages.filter(m => m.direction === 'outbound-api' || m.direction === 'outbound-call');
  
  // Metrics from real data
  const metrics = analytics?.metrics || {
    totalMessagesSentToday: 0,
    totalMessagesReceivedToday: 0,
    totalMessagesSentThisMonth: 0,
    deliveryRateToday: 0,
    failedToday: 0
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Messaging</h1>
          <p className="text-gray-500">Send and receive messages through your SyncGrid numbers</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors">
          <Send size={16} className="mr-2" />
          New Message
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'inbox' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('inbox')}
          >
            Inbox
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'sent' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('sent')}
          >
            Sent
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'analytics' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'settings' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Message Analytics Section */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Outgoing Messages */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-medium">Outgoing Messages</h3>
              <button onClick={refresh} className="text-gray-500 hover:text-gray-700">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center h-56">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="text-sm text-gray-500 mb-1">Sent Today</h4>
                      <p className="text-2xl font-bold">{metrics.totalMessagesSentToday}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm text-gray-500 mb-1">This Month</h4>
                      <p className="text-2xl font-bold">{formatNumber(metrics.totalMessagesSentThisMonth)}</p>
                    </div>
                  </div>
                  
                  {/* Status summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-gray-100 rounded-md p-4">
                      <div className="flex items-center mb-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm text-gray-600">Delivered</span>
                      </div>
                      <div className="text-2xl font-bold">{metrics.deliveryRateToday}%</div>
                    </div>
                    <div className="border border-gray-100 rounded-md p-4">
                      <div className="flex items-center mb-2">
                        <XCircle className="w-4 h-4 text-red-500 mr-2" />
                        <span className="text-sm text-gray-600">Failed</span>
                      </div>
                      <div className="text-2xl font-bold">{metrics.failedToday}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Conversation Metrics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-lg font-medium">Conversation Metrics</h3>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm text-gray-500 mb-1">Received Today</h4>
                  <p className="text-2xl font-bold">{metrics.totalMessagesReceivedToday}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm text-gray-500 mb-1">Delivery Rate</h4>
                  <p className="text-2xl font-bold">{metrics.deliveryRateToday}%</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="text-sm text-gray-500 mb-1">Total Outbound</h4>
                  <p className="text-2xl font-bold">{outboundMessages.length}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="text-sm text-gray-500 mb-1">Total Inbound</h4>
                  <p className="text-2xl font-bold">{inboundMessages.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message List Section - For Inbox and Sent tabs */}
      {(activeTab === 'inbox' || activeTab === 'sent') && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Search and filter bar */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4">
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search messages..." 
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={refresh} className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
              <RefreshCw size={18} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mr-3" />
              <span className="text-gray-500">Loading messages from Twilio...</span>
            </div>
          )}

          {/* Messages Table */}
          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(activeTab === 'inbox' ? inboundMessages : outboundMessages)
                    .filter(msg => !searchQuery || 
                      msg.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      msg.from?.includes(searchQuery) ||
                      msg.to?.includes(searchQuery)
                    )
                    .slice(0, 50)
                    .map((message, index) => (
                      <tr key={message.sid || index} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{formatPhoneNumber(message.from)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{formatPhoneNumber(message.to)}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 truncate max-w-xs">{message.body || '(No content)'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            message.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            message.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                            message.status === 'failed' || message.status === 'undelivered' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {message.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(message.dateSent).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  {(activeTab === 'inbox' ? inboundMessages : outboundMessages).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No messages found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4">Messaging Settings</h3>
            
            <div className="mb-8">
              <h4 className="text-lg font-medium mb-4">Compliance Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium mb-2">A2P 10DLC Registration</h5>
                  <p className="text-sm text-gray-600 mb-4">Register your brand and campaigns for high-volume messaging</p>
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    Manage Registration →
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium mb-2">Opt-out Management</h5>
                  <p className="text-sm text-gray-600 mb-4">Configure auto-response for opt-out keywords</p>
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    Configure Settings →
                  </button>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-medium mb-4">Message Templates</h4>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h5 className="font-medium">Saved Templates</h5>
                    <p className="text-sm text-gray-600">Create reusable message templates</p>
                  </div>
                  <button className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700">
                    New Template
                  </button>
                </div>
                
                {/* Template list placeholder */}
                <div className="text-sm text-gray-500 italic">
                  No templates created yet. Create your first template to speed up messaging.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}