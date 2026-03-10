import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
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
  Bell,
  Loader2
} from 'lucide-react';

interface CreditTransaction {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
}

interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  price: string;
  description?: string;
  isActive: boolean;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('credits');
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [minBalance, setMinBalance] = useState(100);
  const [refillAmount, setRefillAmount] = useState(1000);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(1000);

  // Real data from API
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditRates, setCreditRates] = useState<any>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [monthlySpending, setMonthlySpending] = useState(0);

  // Fetch credit data from API
  const fetchCreditData = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Fetch credit balance and rates
      const creditsRes = await fetch(`/api/users/${user.id}/credits`, { credentials: 'include' });
      if (creditsRes.ok) {
        const data = await creditsRes.json();
        setCreditBalance(data.balance || 0);
        setCreditRates(data.rates);
        setMinBalance(data.rates?.lowBalanceThreshold || 50);
      }

      // Fetch transactions
      const transRes = await fetch(`/api/users/${user.id}/credits/transactions?limit=20`, { credentials: 'include' });
      if (transRes.ok) {
        const data = await transRes.json();
        setTransactions(data || []);
        
        // Calculate monthly spending from consumption transactions
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const spending = (data || [])
          .filter((t: CreditTransaction) => 
            t.type === 'consumption' && 
            new Date(t.createdAt) >= monthStart
          )
          .reduce((sum: number, t: CreditTransaction) => sum + Math.abs(t.amount), 0);
        setMonthlySpending(spending);
      }

      // Fetch credit packages
      const packagesRes = await fetch('/api/credit-packages', { credentials: 'include' });
      if (packagesRes.ok) {
        const data = await packagesRes.json();
        setCreditPackages(data || []);
      }

      // Check user's auto-refill settings
      if (user.autoRefillEnabled !== undefined) {
        setAutoRefillEnabled(user.autoRefillEnabled);
      }
      if (user.autoRefillThreshold) {
        setMinBalance(user.autoRefillThreshold);
      }
      if (user.autoRefillAmount) {
        setRefillAmount(user.autoRefillAmount);
      }
    } catch (error) {
      console.error('Error fetching credit data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCreditData();
  }, [fetchCreditData]);

  // Default packages if none from API
  const displayPackages = creditPackages.length > 0 ? creditPackages.map(pkg => ({
    id: pkg.id,
    credits: pkg.credits,
    price: parseFloat(pkg.price.replace('$', '')),
    pricePerCredit: parseFloat(pkg.price.replace('$', '')) / pkg.credits,
    name: pkg.name,
    savings: pkg.credits >= 10000 ? '5%' : pkg.credits >= 100000 ? '15%' : undefined
  })) : [
    { id: 1, credits: 1000, price: 10.00, pricePerCredit: 0.01, name: 'Starter' },
    { id: 2, credits: 10000, price: 95.00, pricePerCredit: 0.0095, savings: '5%', name: 'Pro' },
    { id: 3, credits: 100000, price: 850.00, pricePerCredit: 0.0085, savings: '15%', name: 'Enterprise' }
  ];

  // Usage breakdown from rates
  const usageBreakdown = [
    { service: 'SMS Outbound', credits: creditRates?.smsOutboundCredits || 1, description: 'per message' },
    { service: 'SMS Inbound', credits: creditRates?.smsInboundCredits || 0, description: 'per message' },
    { service: 'MMS Outbound', credits: creditRates?.mmsOutboundCredits || 3, description: 'per message' },
  ];

  // Handle purchase (placeholder - would integrate with payment processor)
  const handlePurchase = async () => {
    toast({
      title: 'Purchase Credits',
      description: `To purchase ${purchaseAmount} credits, please contact your account manager or use the payment portal.`,
    });
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
          <p className="text-gray-500">Manage your Elite Financial credits and payment settings</p>
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
          {isLoading ? (
            <div className="col-span-3 flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            displayPackages.map(pkg => (
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
            ))
          )}
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
                    <span className="text-sm text-gray-500">{item.credits} credits {item.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium">Monthly Summary</h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Credits Used This Month</span>
                  <span className="font-semibold">{formatCredits(monthlySpending)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Current Balance</span>
                  <span className="font-semibold text-green-600">{formatCredits(creditBalance)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Low Balance Alert</span>
                  <span className="font-semibold">{formatCredits(minBalance)} credits</span>
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
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No transactions yet
                    </td>
                  </tr>
                ) : (
                  transactions.map(transaction => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`capitalize ${
                          transaction.type === 'purchase' || transaction.type === 'bonus'
                            ? 'text-green-600' 
                            : transaction.type === 'consumption' ? 'text-orange-600' : 'text-blue-600'
                        }`}>
                          {transaction.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">
                        <span className={transaction.amount > 0 ? 'text-green-600' : 'text-gray-900'}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {transaction.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Balance: {transaction.balanceAfter}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
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
                    Credits will be added to your account immediately and can be used for all Elite Financial services.
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