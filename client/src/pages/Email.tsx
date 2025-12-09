import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { 
  Mail, 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  BarChart3,
  Table2,
  Settings,
  Upload,
  List,
  Paperclip
} from 'lucide-react';

export default function Email() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock emails data (would come from API)
  const emails = [
    { id: 1, to: 'customer@example.com', subject: 'Welcome to Our Service', status: 'delivered', date: '2025-05-12T14:32:00' },
    { id: 2, to: 'support@example.com', subject: 'Monthly Newsletter', status: 'delivered', date: '2025-05-10T09:15:00' },
    { id: 3, to: 'customer2@example.com', subject: 'Your Order Confirmation', status: 'delivered', date: '2025-05-09T16:45:00' },
    { id: 4, to: 'info@example.com', subject: 'Upcoming Maintenance', status: 'scheduled', date: '2025-05-15T08:00:00' },
    { id: 5, to: 'partner@example.com', subject: 'Partnership Opportunity', status: 'bounced', date: '2025-05-11T11:20:00' }
  ];

  // Mock email statistics
  const stats = {
    sent: 1250,
    delivered: 1220,
    opened: 685,
    clicked: 320,
    bounced: 30
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Email</h1>
          <p className="text-gray-500">Send and manage emails through SendGrid</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors">
          <Plus size={16} className="mr-2" />
          New Email
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
            Sent Emails
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'templates' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('templates')}
          >
            Templates
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

      {/* Sent Emails Tab */}
      {activeTab === 'inbox' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Search and filter bar */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4">
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search emails..." 
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
              <Filter size={18} className="mr-2" />
              Filter
              <ChevronDown size={16} className="ml-1" />
            </button>
            <button className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
              <Mail size={18} className="mr-2" />
              Status
              <ChevronDown size={16} className="ml-1" />
            </button>
          </div>

          {/* Emails Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {emails.map(email => (
                  <tr key={email.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-6 py-4 whitespace-nowrap">{email.to}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 truncate max-w-xs">{email.subject}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        email.status === 'delivered' 
                          ? 'bg-green-100 text-green-800' 
                          : email.status === 'scheduled'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {email.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(email.date).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-medium">Email Templates</h3>
            <button className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 transition-colors">
              <Plus size={16} className="mr-1" />
              Create Template
            </button>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Template card */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="h-32 bg-gray-50 flex items-center justify-center p-4">
                  <Mail className="w-12 h-12 text-gray-300" />
                </div>
                <div className="p-4">
                  <h4 className="font-medium mb-1">Welcome Email</h4>
                  <p className="text-xs text-gray-500 mb-3">Last edited: May 5, 2025</p>
                  <div className="flex">
                    <button className="text-blue-600 text-sm hover:text-blue-800 mr-3">Edit</button>
                    <button className="text-blue-600 text-sm hover:text-blue-800">Preview</button>
                  </div>
                </div>
              </div>
              
              {/* New template card */}
              <div className="border border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                  <Plus className="w-10 h-10 text-gray-400 mb-2" />
                  <h4 className="font-medium text-gray-700 mb-1">Create New Template</h4>
                  <p className="text-xs text-gray-500 mb-3">Design a custom email template</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <StatCard title="Sent" value={stats.sent} />
            <StatCard title="Delivered" value={stats.delivered} percentage={(stats.delivered / stats.sent) * 100} />
            <StatCard title="Opened" value={stats.opened} percentage={(stats.opened / stats.delivered) * 100} />
            <StatCard title="Clicked" value={stats.clicked} percentage={(stats.clicked / stats.opened) * 100} />
            <StatCard title="Bounced" value={stats.bounced} percentage={(stats.bounced / stats.sent) * 100} isNegative />
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Email Performance</h3>
              <div className="flex">
                <button className="bg-blue-500 text-white p-1.5 rounded-l">
                  <BarChart3 size={16} />
                </button>
                <button className="bg-gray-100 text-gray-500 p-1.5 rounded-r">
                  <Table2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="h-64 relative">
                <div className="absolute inset-0 flex items-end space-x-1">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const height = Math.max(15, Math.min(90, Math.random() * 100));
                    return (
                      <div key={i} className="flex-1 flex flex-col justify-end">
                        <div 
                          className="bg-blue-500 rounded-sm" 
                          style={{ height: `${height}%` }}
                        ></div>
                      </div>
                    );
                  })}
                </div>
                
                {/* X-axis labels */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 pt-4">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (6 - i));
                    return (
                      <div key={i} className="text-center">
                        {date.getDate()} May
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-6">Email Settings</h3>
            
            <div className="mb-8">
              <h4 className="text-lg font-medium mb-4">SendGrid Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium mb-2">API Configuration</h5>
                  <p className="text-sm text-gray-600 mb-4">Your SendGrid API integration is active and working properly.</p>
                  <div className="flex items-center text-sm text-green-600">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                    Connected
                  </div>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium mb-2">Sender Identity</h5>
                  <p className="text-sm text-gray-600 mb-2">Verified sender email:</p>
                  <p className="font-medium">noreply@softlinkiq.com</p>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-medium mb-4">Advanced Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h5 className="font-medium">Event Webhooks</h5>
                      <p className="text-sm text-gray-600">Configure webhooks for email events</p>
                    </div>
                    <button className="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200">
                      Configure
                    </button>
                  </div>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h5 className="font-medium">Tracking Settings</h5>
                      <p className="text-sm text-gray-600">Configure open and click tracking</p>
                    </div>
                    <button className="bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm hover:bg-gray-200">
                      Configure
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  percentage, 
  isNegative = false
}: { 
  title: string;
  value: number;
  percentage?: number;
  isNegative?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <p className="text-2xl font-bold mb-1">{value}</p>
      {percentage !== undefined && (
        <div className={`text-xs ${isNegative ? 'text-red-500' : 'text-green-500'}`}>
          {percentage.toFixed(1)}%
        </div>
      )}
    </div>
  );
}