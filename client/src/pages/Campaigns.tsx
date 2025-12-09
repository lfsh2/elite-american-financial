import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { 
  Megaphone, 
  Plus, 
  Clock, 
  Calendar, 
  BarChart3, 
  FileCheck,
  ChevronRight,
  Check,
  AlertCircle,
  Building
} from 'lucide-react';

export default function Campaigns() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('campaigns');

  // Mock campaign data
  const campaigns = [
    { 
      id: 1, 
      name: 'Monthly Newsletter', 
      status: 'active', 
      type: 'marketing', 
      useCase: 'Promotional', 
      registrationStatus: 'approved',
      lastSent: '2025-05-10T15:22:00',
      stats: {
        sent: 2345,
        delivered: 2312,
        clicked: 457
      }
    },
    { 
      id: 2, 
      name: 'Appointment Reminders', 
      status: 'active', 
      type: 'transactional', 
      useCase: 'Informational',
      registrationStatus: 'approved',
      lastSent: '2025-05-12T09:15:00',
      stats: {
        sent: 189,
        delivered: 189,
        clicked: 162
      }
    },
    { 
      id: 3, 
      name: 'Flash Sale', 
      status: 'draft', 
      type: 'marketing', 
      useCase: 'Promotional',
      registrationStatus: 'pending',
      lastSent: null,
      stats: {
        sent: 0,
        delivered: 0,
        clicked: 0
      }
    }
  ];

  // A2P Registration data
  const a2pRegistrations = [
    {
      id: 1,
      type: 'brand',
      name: 'Softlink IQ',
      status: 'approved',
      externalId: 'BR-123456',
      dateRegistered: '2025-04-15T10:30:00'
    },
    {
      id: 2,
      type: 'campaign',
      name: 'Monthly Newsletter',
      useCase: 'Promotional',
      status: 'approved',
      externalId: 'CA-123456',
      dateRegistered: '2025-04-16T14:25:00'
    },
    {
      id: 3,
      type: 'campaign',
      name: 'Appointment Reminders',
      useCase: 'Informational',
      status: 'approved',
      externalId: 'CA-123457',
      dateRegistered: '2025-04-16T14:40:00'
    },
    {
      id: 4,
      type: 'campaign',
      name: 'Flash Sale',
      useCase: 'Promotional',
      status: 'pending',
      externalId: 'CA-123458',
      dateRegistered: '2025-05-11T11:20:00'
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Campaigns</h1>
          <p className="text-gray-500">Create and manage message campaigns and A2P 10DLC registrations</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors">
          <Plus size={16} className="mr-2" />
          New Campaign
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'campaigns' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('campaigns')}
          >
            Campaigns
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'a2p' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('a2p')}
          >
            A2P Registrations
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

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">A2P Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Analytics</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns.map(campaign => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{campaign.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        campaign.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {campaign.status === 'active' ? 'Active' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap capitalize">{campaign.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        campaign.registrationStatus === 'approved' 
                          ? 'bg-green-100 text-green-800' 
                          : campaign.registrationStatus === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {campaign.registrationStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {campaign.lastSent 
                        ? new Date(campaign.lastSent).toLocaleString() 
                        : 'Not sent yet'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {campaign.stats.sent > 0 ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-700">{campaign.stats.sent} sent</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-green-600">{((campaign.stats.delivered / campaign.stats.sent) * 100).toFixed(1)}% delivered</span>
                        </div>
                      ) : 'No data'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* A2P Registrations Tab */}
      {activeTab === 'a2p' && (
        <div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="mr-4 flex-shrink-0">
                <Building className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-blue-800 mb-1">A2P 10DLC Registration</h3>
                <p className="text-sm text-blue-600 mb-2">
                  A2P 10DLC (Application-to-Person 10-digit Long Code) is a messaging solution that enables businesses to send high-volume messages to their customers using local phone numbers.
                </p>
                <p className="text-sm text-blue-600">
                  Registration with the Campaign Registry is required for all business messaging campaigns to ensure compliance and optimal delivery rates.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Your A2P Registrations</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">External ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Registered</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {a2pRegistrations.map(registration => (
                    <tr key={registration.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap capitalize">{registration.type}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{registration.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          registration.status === 'approved' 
                            ? 'bg-green-100 text-green-800' 
                            : registration.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {registration.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{registration.externalId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(registration.dateRegistered).toLocaleString()}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium mb-4">Register a New Brand</h3>
              <p className="text-sm text-gray-600 mb-4">
                Register your company as a verified business sender with the Campaign Registry.
                This is the first step in A2P 10DLC registration.
              </p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                Start Brand Registration
              </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium mb-4">Register a New Campaign</h3>
              <p className="text-sm text-gray-600 mb-4">
                Register a new messaging campaign for your verified brand.
                Each distinct messaging use case requires its own campaign.
              </p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                Register Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium">Message Templates</h3>
            <button className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 transition-colors">
              <Plus size={16} className="mr-1" />
              New Template
            </button>
          </div>
          
          <div className="text-center py-8 text-gray-500">
            <Megaphone className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>No templates created yet</p>
            <p className="text-sm mt-1">Create templates to streamline your campaign messaging</p>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden p-6">
          <h3 className="text-lg font-medium mb-6">Campaign Performance</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm text-gray-500 mb-1">Messages Sent</h4>
              <p className="text-2xl font-bold">2,534</p>
              <p className="text-sm text-green-500 mt-2">↑ 15% this month</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm text-gray-500 mb-1">Delivery Rate</h4>
              <p className="text-2xl font-bold">98.5%</p>
              <p className="text-sm text-green-500 mt-2">↑ 0.3% this month</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm text-gray-500 mb-1">Response Rate</h4>
              <p className="text-2xl font-bold">24.7%</p>
              <p className="text-sm text-green-500 mt-2">↑ 2.1% this month</p>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium mb-4">Campaign Comparison</h3>
            <div className="text-sm text-gray-500 italic">
              Select campaigns to compare performance
            </div>
          </div>
        </div>
      )}
    </div>
  );
}