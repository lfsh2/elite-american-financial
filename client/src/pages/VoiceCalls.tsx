import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useTwilioAnalytics, formatPhoneNumber, formatDuration } from '../hooks/useTwilioData';
import { 
  Phone, 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  BarChart3,
  Table2,
  Settings,
  Clock,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Mic,
  VideoIcon,
  UserPlus,
  CalendarDays,
  Layers,
  HelpCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';

export default function VoiceCalls() {
  const { user } = useAuth();
  const { analytics, loading, error, refresh } = useTwilioAnalytics();
  const [activeTab, setActiveTab] = useState('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCallModal, setShowNewCallModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  // Real call history from Twilio
  const callHistory = analytics?.calls.thisMonth || [];
  const inboundCalls = callHistory.filter(c => c.direction === 'inbound');
  const outboundCalls = callHistory.filter(c => c.direction === 'outbound-api' || c.direction === 'outbound-dial');

  // Real phone numbers from Twilio
  const phoneNumbers = analytics?.phoneNumbers.filter(p => p.capabilities.voice) || [];

  // Mock IVR menus (would come from database)
  const ivrMenus = [
    { id: 1, name: 'Main Menu', actions: 5, lastEdited: '2025-05-10T15:30:00' },
    { id: 2, name: 'Support Hours', actions: 3, lastEdited: '2025-05-08T11:20:00' },
    { id: 3, name: 'Holiday Schedule', actions: 2, lastEdited: '2025-05-01T09:15:00' }
  ];

  // Real call stats from Twilio
  const stats = analytics ? {
    totalCalls: analytics.metrics.totalCallsThisWeek,
    inbound: inboundCalls.length,
    outbound: outboundCalls.length,
    avgDuration: formatDuration(Math.round(analytics.metrics.totalCallDurationToday / Math.max(analytics.metrics.totalCallsToday, 1))),
    missedCalls: callHistory.filter(c => c.status === 'no-answer' || c.status === 'busy').length
  } : {
    totalCalls: 0,
    inbound: 0,
    outbound: 0,
    avgDuration: '0m 0s',
    missedCalls: 0
  };

  // Helper functions
  const getStatusIcon = (status: string, direction: string) => {
    if (status === 'completed') {
      return direction === 'inbound' 
        ? <PhoneIncoming size={16} className="text-green-500" /> 
        : <PhoneOutgoing size={16} className="text-blue-500" />;
    } else if (status === 'no-answer') {
      return <PhoneMissed size={16} className="text-red-500" />;
    } else {
      return <Phone size={16} className="text-gray-500" />;
    }
  };

  const formatPhone = (number: string) => {
    // Format as (XXX) XXX-XXXX if US/Canada number
    if (number.startsWith('+1') && number.length === 12) {
      return `(${number.substring(2, 5)}) ${number.substring(5, 8)}-${number.substring(8)}`;
    }
    return number;
  };

  // Format call duration from seconds string
  const formatCallDuration = (duration: string) => {
    const secs = parseInt(duration || '0');
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Voice Calls</h1>
          <p className="text-gray-500">Manage phone calls and voice services</p>
        </div>
        <button 
          className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors"
          onClick={() => setShowNewCallModal(true)}
        >
          <Plus size={16} className="mr-2" />
          New Call
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'history' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('history')}
          >
            Call History
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'ivr' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('ivr')}
          >
            IVR & Voice Menus
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'forwarding' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('forwarding')}
          >
            Call Forwarding
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'analytics' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </div>
      </div>

      {/* Call History Tab */}
      {activeTab === 'history' && (
        <div>
          {/* Call Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <StatCard title="Total Calls" value={stats.totalCalls.toString()} icon={<Phone size={20} className="text-blue-500" />} />
            <StatCard title="Inbound" value={stats.inbound.toString()} icon={<PhoneIncoming size={20} className="text-green-500" />} />
            <StatCard title="Outbound" value={stats.outbound.toString()} icon={<PhoneOutgoing size={20} className="text-blue-500" />} />
            <StatCard title="Avg Duration" value={stats.avgDuration} icon={<Clock size={20} className="text-indigo-500" />} />
            <StatCard title="Missed Calls" value={stats.missedCalls.toString()} icon={<PhoneMissed size={20} className="text-red-500" />} />
          </div>

          {/* Call History Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Search and filter bar */}
            <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4">
              <div className="relative flex-grow max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search calls..." 
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
                <Phone size={18} className="mr-2" />
                Number
                <ChevronDown size={16} className="ml-1" />
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mr-3" />
                <span className="text-gray-500">Loading calls from Twilio...</span>
              </div>
            )}

            {/* Call History Table */}
            {!loading && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Call</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {callHistory.map((call, index) => (
                      <tr key={call.sid || index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusIcon(call.status, call.direction)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{formatPhone(call.from)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{formatPhone(call.to)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{formatCallDuration(call.duration)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            call.status === 'completed' 
                              ? 'bg-green-100 text-green-800' 
                              : call.status === 'no-answer' || call.status === 'busy'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {call.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(call.startTime).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button className="text-blue-600 hover:text-blue-900">
                            <Phone size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {callHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          No calls found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* IVR & Voice Menus Tab */}
      {activeTab === 'ivr' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">IVR Menus</h3>
              <button className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 transition-colors">
                <Plus size={16} className="mr-1" />
                Create Menu
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Menu Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Edited</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ivrMenus.map(menu => (
                    <tr key={menu.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{menu.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{menu.actions}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(menu.lastEdited).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                        <button className="text-blue-600 hover:text-blue-900">Clone</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium mb-4">Voice Recordings</h3>
              <p className="text-sm text-gray-600 mb-4">
                Create and manage custom voice recordings for your IVR menus and voice applications.
              </p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center">
                <Mic size={16} className="mr-2" />
                Manage Recordings
              </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium mb-4">Text-to-Speech</h3>
              <p className="text-sm text-gray-600 mb-4">
                Convert text to realistic speech for use in your voice applications and IVR systems.
              </p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center">
                <Layers size={16} className="mr-2" />
                Text-to-Speech Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Forwarding Tab */}
      {activeTab === 'forwarding' && (
        <div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Call Forwarding Settings</h3>
              <p className="text-sm text-gray-500 mt-1">Configure call forwarding rules for your phone numbers</p>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Phone Number</label>
                <select className="border border-gray-300 rounded-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {phoneNumbers.map((number, index) => (
                    <option key={number.phoneNumber || index} value={number.phoneNumber}>
                      {number.friendlyName} ({formatPhone(number.phoneNumber)})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <input 
                    id="always" 
                    type="radio" 
                    name="forwarding" 
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    checked
                  />
                  <label htmlFor="always" className="ml-2 block text-sm text-gray-700">
                    Always forward calls
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input 
                    id="busy" 
                    type="radio" 
                    name="forwarding" 
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <label htmlFor="busy" className="ml-2 block text-sm text-gray-700">
                    Forward when busy or no answer
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input 
                    id="schedule" 
                    type="radio" 
                    name="forwarding" 
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <label htmlFor="schedule" className="ml-2 block text-sm text-gray-700">
                    Forward on schedule
                  </label>
                </div>
              </div>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Forward to</label>
                <div className="flex">
                  <input 
                    type="text" 
                    placeholder="Enter phone number" 
                    className="border border-gray-300 rounded-l-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-r-md hover:bg-blue-700 transition-colors">
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium mb-4">Advanced Routing</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create advanced call routing rules based on time of day, caller ID, or other conditions.
            </p>
            <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors flex items-center">
              <Layers size={16} className="mr-2" />
              Configure Advanced Routing
            </button>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Call Volume</h3>
              <p className="text-3xl font-bold">126</p>
              <p className="text-sm text-green-500 mt-2 flex items-center">
                <ArrowUpIcon className="w-3 h-3 mr-1" />
                8% this week
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Average Call Duration</h3>
              <p className="text-3xl font-bold">2m 32s</p>
              <p className="text-sm text-green-500 mt-2 flex items-center">
                <ArrowUpIcon className="w-3 h-3 mr-1" />
                12% this week
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Call Success Rate</h3>
              <p className="text-3xl font-bold">94.3%</p>
              <p className="text-sm text-red-500 mt-2 flex items-center">
                <ArrowDownIcon className="w-3 h-3 mr-1" />
                1.2% this week
              </p>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Call Volume Trends</h3>
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
                    const inboundHeight = Math.max(15, Math.min(70, Math.random() * 100));
                    const outboundHeight = Math.max(10, Math.min(50, Math.random() * 80));
                    return (
                      <div key={i} className="flex-1 flex flex-col justify-end">
                        <div className="flex flex-col justify-end w-full space-y-1">
                          <div 
                            className="bg-green-500 rounded-sm w-full" 
                            style={{ height: `${inboundHeight}%` }}
                          ></div>
                          <div 
                            className="bg-blue-500 rounded-sm w-full" 
                            style={{ height: `${outboundHeight}%` }}
                          ></div>
                        </div>
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
              
              <div className="flex justify-center space-x-8 mt-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-sm mr-2"></div>
                  <span className="text-sm text-gray-600">Inbound</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-sm mr-2"></div>
                  <span className="text-sm text-gray-600">Outbound</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Call Modal */}
      {showNewCallModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Make a Call</h3>
              <button 
                className="text-gray-400 hover:text-gray-500"
                onClick={() => setShowNewCallModal(false)}
              >
                &times;
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
              <select className="border border-gray-300 rounded-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                {phoneNumbers.map((number, index) => (
                  <option key={number.phoneNumber || index} value={number.phoneNumber}>
                    {number.friendlyName} ({formatPhone(number.phoneNumber)})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
              <input 
                type="tel" 
                placeholder="Enter phone number" 
                className="border border-gray-300 rounded-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            
            <div className="flex justify-between">
              <button 
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
                onClick={() => setShowNewCallModal(false)}
              >
                Cancel
              </button>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center">
                <Phone size={16} className="mr-2" />
                Call Now
              </button>
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
  icon
}: { 
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17z" clipRule="evenodd" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3z" clipRule="evenodd" />
    </svg>
  );
}