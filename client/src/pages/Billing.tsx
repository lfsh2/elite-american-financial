import React, { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { 
  CreditCard, 
  Plus, 
  Settings, 
  Download, 
  RefreshCw,
  DollarSign,
  BarChart3,
  Calendar,
  Clock,
  ChevronDown,
  CheckCircle,
  FileText,
  Info,
  AlertTriangle,
  ChevronRight,
  Wallet,
  ArrowRight,
  Activity,
  PlusCircle,
  Settings as SettingsIcon,
  CreditCard as CreditCardIcon,
  Bell
} from 'lucide-react';

export default function Billing() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('credits');
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [minBalance, setMinBalance] = useState(100);
  const [refillAmount, setRefillAmount] = useState(1000);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(1000);

  // Mock credit data
  const creditBalance = 2345;
  const monthlySpending = 1240;
  const projectedMonthEnd = 1850;

  // Mock credit packages
  const creditPackages = [
    { id: 1, credits: 1000, price: 10.00, pricePerCredit: 0.01 },
    { id: 2, credits: 10000, price: 95.00, pricePerCredit: 0.0095, savings: '5%' },
    { id: 3, credits: 100000, price: 850.00, pricePerCredit: 0.0085, savings: '15%' }
  ];

  // Mock usage data
  const usageBreakdown = [
    { service: 'SMS', credits: 850, percentage: 65 },
    { service: 'Voice Calls', credits: 340, percentage: 26 },
    { service: 'Phone Numbers', credits: 120, percentage: 9 }
  ];

  // Mock transaction history
  const transactions = [
    { id: 1, type: 'purchase', amount: 1000, credits: 1000, date: '2025-05-10T12:30:00', status: 'completed' },
    { id: 2, type: 'usage', amount: -120, credits: -120, service: 'SMS', date: '2025-05-09T00:00:00', status: 'completed' },
    { id: 3, type: 'usage', amount: -45, credits: -45, service: 'Voice', date: '2025-05-08T00:00:00', status: 'completed' },
    { id: 4, type: 'auto-refill', amount: 1000, credits: 1000, date: '2025-05-05T14:25:00', status: 'completed' },
    { id: 5, type: 'usage', amount: -250, credits: -250, service: 'SMS', date: '2025-05-04T00:00:00', status: 'completed' }
  ];

  // Credit usage by day (for chart)
  const dailyUsage = [
    { date: '2025-05-06', credits: 120 },
    { date: '2025-05-07', credits: 150 },
    { date: '2025-05-08', credits: 135 },
    { date: '2025-05-09', credits: 180 },
    { date: '2025-05-10', credits: 160 },
    { date: '2025-05-11', credits: 190 },
    { date: '2025-05-12', credits: 210 }
  ];

  // Handle purchase
  const handlePurchase = () => {
    // In a real app, this would call the billing API
    alert(`Purchased ${purchaseAmount} credits`);
    setShowPurchaseModal(false);
  };

  // Helper function to format credit values
  const formatCredits = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Billing & Credits</h1>
          <p className="text-gray-500">Manage your SyncGrid credits and payment settings</p>
        </div>
        <div className="flex space-x-3">
          <button 
            className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700 transition-colors"
            onClick={() => setShowPurchaseModal(true)}
          >
            <Plus size={16} className="mr-2" />
            Buy Credits
          </button>
          <button className="border border-gray-300 bg-white px-4 py-2 rounded-md flex items-center hover:bg-gray-50 transition-colors">
            <Settings size={16} className="mr-2" />
            Billing Settings
          </button>
        </div>
      </div>

      {/* Credit Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-500">Credit Balance</h3>
            <div className="bg-blue-50 p-2 rounded-full">
              <Wallet className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <div className="flex items-baseline">
            <p className="text-3xl font-bold">{formatCredits(creditBalance)}</p>
            <p className="text-sm text-gray-500 ml-2">credits</p>
          </div>
          <div className="mt-4">
            <button 
              className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
              onClick={() => setShowPurchaseModal(true)}
            >
              Purchase Credits <ArrowRight size={14} className="ml-1" />
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-500">Credits Used This Month</h3>
            <div className="bg-blue-50 p-2 rounded-full">
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <div className="flex items-baseline">
            <p className="text-3xl font-bold">{formatCredits(monthlySpending)}</p>
            <p className="text-sm text-gray-500 ml-2">credits</p>
          </div>
          <div className="mt-4">
            <button className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center">
              View Usage Details <ArrowRight size={14} className="ml-1" />
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-gray-500">Projected Month-End Usage</h3>
            <div className="bg-blue-50 p-2 rounded-full">
              <BarChart3 className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <div className="flex items-baseline">
            <p className="text-3xl font-bold">{formatCredits(projectedMonthEnd)}</p>
            <p className="text-sm text-gray-500 ml-2">credits</p>
          </div>
          <div className="mt-4">
            <button className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center">
              View Forecast <ArrowRight size={14} className="ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'credits' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('credits')}
          >
            Credit Management
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'usage' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('usage')}
          >
            Usage Breakdown
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm mr-4 ${
              activeTab === 'transactions' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('transactions')}
          >
            Transaction History
          </button>
          <button 
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'auto-refill' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('auto-refill')}
          >
            Auto-Refill
          </button>
        </div>
      </div>

      {/* Credit Management Tab */}
      {activeTab === 'credits' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {creditPackages.map(pkg => (
            <div key={pkg.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-6">
                <h3 className="text-lg font-bold mb-1">{formatCredits(pkg.credits)} Credits</h3>
                <p className="text-2xl font-bold text-blue-600 mb-1">${pkg.price.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mb-4">${pkg.pricePerCredit.toFixed(4)} per credit</p>
                
                {pkg.savings && (
                  <div className="bg-green-50 text-green-800 text-xs font-medium px-2 py-1 rounded inline-block mb-4">
                    Save {pkg.savings}
                  </div>
                )}
                
                <button 
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
                  onClick={() => {
                    setPurchaseAmount(pkg.credits);
                    setShowPurchaseModal(true);
                  }}
                >
                  Purchase
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Breakdown Tab */}
      {activeTab === 'usage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Usage By Service</h3>
            </div>
            <div className="p-6">
              {usageBreakdown.map((item, index) => (
                <div key={index} className="mb-4 last:mb-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{item.service}</span>
                    <span className="text-sm text-gray-500">{item.credits} credits ({item.percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${item.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Daily Usage</h3>
            </div>
            <div className="p-6">
              <div className="h-64 relative">
                <div className="absolute inset-0 flex items-end space-x-1">
                  {dailyUsage.map((day, i) => {
                    const height = (day.credits / 250) * 100;
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
                  {dailyUsage.map((day, i) => {
                    const date = new Date(day.date);
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
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden lg:col-span-2">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Service Pricing</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Equivalent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">SMS (US)</td>
                    <td className="px-6 py-4 whitespace-nowrap">1 credit</td>
                    <td className="px-6 py-4 whitespace-nowrap">$0.01 per SMS</td>
                    <td className="px-6 py-4">Standard rate for text messages sent within the US</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">SMS (International)</td>
                    <td className="px-6 py-4 whitespace-nowrap">1.5 - 5 credits</td>
                    <td className="px-6 py-4 whitespace-nowrap">$0.015 - $0.05 per SMS</td>
                    <td className="px-6 py-4">Varies by country</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">MMS</td>
                    <td className="px-6 py-4 whitespace-nowrap">3 credits</td>
                    <td className="px-6 py-4 whitespace-nowrap">$0.03 per MMS</td>
                    <td className="px-6 py-4">Multimedia messages with images, audio, etc.</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">Voice (US)</td>
                    <td className="px-6 py-4 whitespace-nowrap">2 credits/min</td>
                    <td className="px-6 py-4 whitespace-nowrap">$0.02 per minute</td>
                    <td className="px-6 py-4">Standard voice calls within the US</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">Phone Number (US)</td>
                    <td className="px-6 py-4 whitespace-nowrap">115 credits/month</td>
                    <td className="px-6 py-4 whitespace-nowrap">$1.15 per month</td>
                    <td className="px-6 py-4">Monthly cost for each US phone number</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">A2P 10DLC Registration</td>
                    <td className="px-6 py-4 whitespace-nowrap">500 credits</td>
                    <td className="px-6 py-4 whitespace-nowrap">$5.00 one-time</td>
                    <td className="px-6 py-4">One-time registration with campaign registry</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Tab */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-medium">Transaction History</h3>
            <div className="flex space-x-3">
              <button className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                <Download size={18} className="mr-2" />
                Export
              </button>
              <button className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map(transaction => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`capitalize ${
                        transaction.type === 'purchase' || transaction.type === 'auto-refill'
                          ? 'text-green-600' 
                          : 'text-blue-600'
                      }`}>
                        {transaction.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      <span className={transaction.credits > 0 ? 'text-green-600' : 'text-gray-900'}>
                        {transaction.credits > 0 ? '+' : ''}{transaction.credits}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.type === 'usage' ? `${transaction.service} usage` : 
                        transaction.type === 'purchase' ? 'Manual purchase' : 
                        'Automatic refill'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auto-Refill Tab */}
      {activeTab === 'auto-refill' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <PlusCircle className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Automatic Credit Refill</h3>
                  <label className="inline-flex items-center cursor-pointer">
                    <span className="mr-3 text-sm font-medium text-gray-900">
                      {autoRefillEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={autoRefillEnabled}
                        onChange={() => setAutoRefillEnabled(!autoRefillEnabled)}
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </div>
                  </label>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Automatically purchase more credits when your balance falls below a specified threshold.
                </p>
                
                {autoRefillEnabled && (
                  <div className="mt-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Balance Threshold
                      </label>
                      <div className="relative mt-1 rounded-md shadow-sm max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">Credits</span>
                        </div>
                        <input
                          type="number"
                          className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-16 pr-12 sm:text-sm border-gray-300 rounded-md py-2"
                          value={minBalance}
                          onChange={(e) => setMinBalance(parseInt(e.target.value))}
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">
                        Auto-refill will trigger when your balance falls below this amount
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Refill Amount
                      </label>
                      <select
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md max-w-xs"
                        value={refillAmount}
                        onChange={(e) => setRefillAmount(parseInt(e.target.value))}
                      >
                        <option value={1000}>1,000 credits ($10.00)</option>
                        <option value={5000}>5,000 credits ($47.50)</option>
                        <option value={10000}>10,000 credits ($95.00)</option>
                      </select>
                      <p className="mt-2 text-sm text-gray-500">
                        This amount will be automatically purchased when triggered
                      </p>
                    </div>
                    
                    <div className="bg-yellow-50 p-4 rounded-md flex">
                      <div className="flex-shrink-0">
                        <Info className="h-5 w-5 text-yellow-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Payment method required</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>
                            Make sure you have a valid payment method set up in your account settings to enable auto-refill.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-4">
                      <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                        Save Auto-Refill Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Purchase Credits</h3>
              <button 
                className="text-gray-400 hover:text-gray-500"
                onClick={() => setShowPurchaseModal(false)}
              >
                &times;
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-4">
                You are about to purchase {formatCredits(purchaseAmount)} credits for ${(purchaseAmount * 0.01).toFixed(2)}.
              </p>
              
              <div className="border border-gray-200 rounded-md p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-500">Credits:</span>
                  <span className="text-sm font-medium">{formatCredits(purchaseAmount)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-500">Unit Price:</span>
                  <span className="text-sm font-medium">
                    ${purchaseAmount >= 100000 ? '0.0085' : purchaseAmount >= 10000 ? '0.0095' : '0.01'}/credit
                  </span>
                </div>
                <div className="flex justify-between mb-2 border-t border-gray-200 pt-2 mt-2">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-sm font-medium">
                    ${purchaseAmount >= 100000 ? '850.00' : purchaseAmount >= 10000 ? '95.00' : '10.00'}
                  </span>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-md flex mb-4">
                <div className="flex-shrink-0">
                  <Info className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    Credits will be added to your account immediately and can be used for all SyncGrid services.
                  </p>
                </div>
              </div>
              
              <div className="flex items-center mb-4">
                <CreditCardIcon className="w-5 h-5 text-gray-400 mr-2" />
                <span className="text-sm font-medium">Payment Method: Visa ending in 4242</span>
              </div>
            </div>
            
            <div className="flex justify-between">
              <button 
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
                onClick={() => setShowPurchaseModal(false)}
              >
                Cancel
              </button>
              <button 
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                onClick={handlePurchase}
              >
                Complete Purchase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}