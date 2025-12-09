import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useAccountPhoneNumbers } from '../hooks/useTwilioData';
import { useAccount } from '../contexts/AccountContext';
import { 
  Phone, 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  Check,
  X,
  Download,
  RefreshCw,
  Settings,
  Tag,
  Globe,
  MoreHorizontal,
  FileText,
  Search as SearchIcon,
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Loader2
} from 'lucide-react';

export default function PhoneNumbers() {
  const { user } = useAuth();
  const { currentAccount, isOverviewMode } = useAccount();
  const { phoneNumbers: rawPhoneNumbers, loading, error, refresh } = useAccountPhoneNumbers();
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuyNumberModal, setShowBuyNumberModal] = useState(false);
  const [numberSearchResults, setNumberSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchArea, setSearchArea] = useState('');
  const [numberType, setNumberType] = useState('local');
  const [capabilities, setCapabilities] = useState<string[]>(['voice', 'sms']);

  // Transform API phone numbers to display format
  const phoneNumbers = rawPhoneNumbers.map((pn, index) => ({
    id: pn.id || index,
    number: pn.phoneNumber,
    friendlyName: pn.friendlyName || pn.phoneNumber,
    capabilities: pn.capabilities || { voice: false, sms: false, mms: false },
    status: pn.status || 'active',
    region: 'US', // Could be enhanced with Twilio lookup
    monthlyPrice: 1.00, // Default price, could be fetched from Twilio
    purchaseDate: pn.dateCreated || new Date().toISOString(),
  }));

  // Filter by search query
  const filteredNumbers = phoneNumbers.filter(pn => 
    pn.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pn.friendlyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper function for number formatting
  const formatPhoneNumber = (number: string) => {
    // Format as (XXX) XXX-XXXX if US/Canada number
    if (number.startsWith('+1') && number.length === 12) {
      return `(${number.substring(2, 5)}) ${number.substring(5, 8)}-${number.substring(8)}`;
    }
    return number;
  };

  // Mock function to search for available numbers
  const searchForNumbers = () => {
    setIsSearching(true);
    
    // Simulate API call delay
    setTimeout(() => {
      // Generate mock results
      const results = Array.from({ length: 10 }, (_, i) => {
        const areaCode = searchArea || '855';
        const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
        const number = `+1${areaCode}${randomSuffix}`;
        
        return {
          number,
          capabilities: {
            voice: capabilities.includes('voice'),
            sms: capabilities.includes('sms'),
            mms: capabilities.includes('sms'), // MMS typically comes with SMS
          },
          region: 'US',
          monthlyPrice: 1.00
        };
      });
      
      setNumberSearchResults(results);
      setIsSearching(false);
    }, 1000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Phone Numbers</h1>
          <p className="text-gray-500">Manage your SyncGrid phone numbers</p>
        </div>
        <button 
          className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors"
          onClick={() => setShowBuyNumberModal(true)}
        >
          <Plus size={16} className="mr-2" />
          Buy a Number
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'active' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('active')}
          >
            Active Numbers
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'porting' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('porting')}
          >
            Porting Status
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'usage' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('usage')}
          >
            Usage
          </button>
        </div>
      </div>

      {/* Active Numbers Tab */}
      {activeTab === 'active' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Search and filter bar */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4">
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search phone numbers..." 
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
              <Download size={18} className="mr-2" />
              Export
            </button>
            <button 
              className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading phone numbers...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-12 text-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{error}</p>
              <button 
                onClick={refresh}
                className="text-blue-600 hover:text-blue-800"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredNumbers.length === 0 && (
            <div className="p-12 text-center">
              <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No phone numbers found</h3>
              <p className="text-gray-500 mb-4">
                {searchQuery ? 'Try adjusting your search.' : 'Get started by purchasing a phone number.'}
              </p>
              <button 
                onClick={() => setShowBuyNumberModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Buy a Number
              </button>
            </div>
          )}

          {/* Phone Numbers Table */}
          {!loading && !error && filteredNumbers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friendly Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capabilities</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredNumbers.map(number => (
                    <tr key={number.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium">{formatPhoneNumber(number.number)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{number.friendlyName}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          {number.capabilities.voice && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Voice
                            </span>
                          )}
                          {number.capabilities.sms && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              SMS
                            </span>
                          )}
                          {number.capabilities.mms && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              MMS
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          number.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {number.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(number.purchaseDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button className="text-blue-600 hover:text-blue-900 mr-2">
                            <Settings size={16} />
                          </button>
                          <button className="text-blue-600 hover:text-blue-900">
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Porting Status Tab */}
      {activeTab === 'porting' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden p-8 text-center">
          <div className="max-w-md mx-auto">
            <div className="mb-4">
              <Phone className="w-12 h-12 text-gray-300 mx-auto" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Port Requests</h3>
            <p className="text-gray-500 mb-6">You haven't submitted any requests to port existing phone numbers to SyncGrid.</p>
            
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-left">
              <h4 className="text-blue-800 font-medium flex items-center mb-2">
                <ShieldCheck className="w-5 h-5 mr-2 text-blue-500" />
                Port Your Existing Numbers
              </h4>
              <p className="text-blue-600 text-sm mb-4">
                Transfer your existing phone numbers from another provider to SyncGrid.
              </p>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                Start Porting Process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-medium">Phone Number Usage</h3>
            <p className="text-sm text-gray-500 mt-1">Track usage metrics for your phone numbers</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 className="text-sm text-gray-600 mb-1">Total Active Numbers</h4>
                <p className="text-2xl font-bold text-blue-800">{filteredNumbers.length}</p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 className="text-sm text-gray-600 mb-1">Voice Enabled</h4>
                <p className="text-2xl font-bold text-blue-800">
                  {filteredNumbers.filter(num => num.capabilities.voice).length}/{filteredNumbers.length}
                </p>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 className="text-sm text-gray-600 mb-1">SMS Enabled</h4>
                <p className="text-2xl font-bold text-blue-800">
                  {filteredNumbers.filter(num => num.capabilities.sms).length}/{filteredNumbers.length}
                </p>
              </div>
            </div>
            
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-medium">Phone Numbers ({filteredNumbers.length})</h4>
                </div>
                
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friendly Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capabilities</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredNumbers.map(number => (
                      <tr key={number.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{formatPhoneNumber(number.number)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{number.friendlyName}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            {number.capabilities.voice && <span className="text-blue-600">📞</span>}
                            {number.capabilities.sms && <span className="text-green-600">💬</span>}
                            {number.capabilities.mms && <span className="text-purple-600">📷</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(number.purchaseDate).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buy Number Modal */}
      {showBuyNumberModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Buy a New Phone Number</h3>
              <button 
                className="text-gray-400 hover:text-gray-500"
                onClick={() => {
                  setShowBuyNumberModal(false);
                  setNumberSearchResults([]);
                }}
              >
                &times;
              </button>
            </div>
            
            <div className="mb-6">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                <h4 className="text-blue-800 font-medium flex items-center mb-2">
                  <ShieldCheck className="w-5 h-5 mr-2 text-blue-500" />
                  Get a New Phone Number
                </h4>
                <p className="text-blue-600 text-sm">
                  Search for available phone numbers by area code, region, or features. All numbers include automatic compliance management.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number Type</label>
                  <select 
                    className="border border-gray-300 rounded-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={numberType}
                    onChange={(e) => setNumberType(e.target.value)}
                  >
                    <option value="local">Local</option>
                    <option value="tollfree">Toll-Free</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Area Code/Location</label>
                  <input 
                    type="text" 
                    placeholder="Enter area code (e.g., 855)"
                    className="border border-gray-300 rounded-md w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={searchArea}
                    onChange={(e) => setSearchArea(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Capabilities</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={capabilities.includes('voice')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCapabilities([...capabilities, 'voice']);
                          } else {
                            setCapabilities(capabilities.filter(c => c !== 'voice'));
                          }
                        }}
                      />
                      <span className="ml-2 text-sm text-gray-700">Voice</span>
                    </label>
                    <label className="flex items-center">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={capabilities.includes('sms')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCapabilities([...capabilities, 'sms']);
                          } else {
                            setCapabilities(capabilities.filter(c => c !== 'sms'));
                          }
                        }}
                      />
                      <span className="ml-2 text-sm text-gray-700">SMS</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <button 
                className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors w-full justify-center"
                onClick={searchForNumbers}
                disabled={isSearching}
              >
                {isSearching ? (
                  <>
                    <RefreshCw size={16} className="mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <SearchIcon size={16} className="mr-2" />
                    Search Available Numbers
                  </>
                )}
              </button>
            </div>
            
            {/* Search Results */}
            {numberSearchResults.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Available Phone Numbers</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capabilities</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Region</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Price</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {numberSearchResults.map((number, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium">{formatPhoneNumber(number.number)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex space-x-2">
                              {number.capabilities.voice && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Voice
                                </span>
                              )}
                              {number.capabilities.sms && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  SMS
                                </span>
                              )}
                              {number.capabilities.mms && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  MMS
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{number.region}</td>
                          <td className="px-6 py-4 whitespace-nowrap">${number.monthlyPrice.toFixed(2)}/mo</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors text-sm">
                              Buy
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h5 className="font-medium text-sm mb-2">Need a specific number?</h5>
                  <p className="text-sm text-gray-600 mb-3">Try adjusting your search criteria or contact support for help finding the perfect number for your business.</p>
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center">
                    Contact Support <ArrowRight size={14} className="ml-1" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}