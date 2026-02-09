import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  Building2, 
  Plus, 
  Check, 
  Loader2,
  LayoutGrid,
  ChevronRight,
  Settings,
  UserPlus,
  RefreshCw,
  User,
  Users
} from 'lucide-react';
import { useAccount, Account, getProviderInfo, ProviderType } from '../contexts/AccountContext';
import { ProviderLogo, TwilioLogo, CommioLogo } from './ProviderLogos';
import ConnectAccountModal from './ConnectAccountModal';
import SubAccountModal from './SubAccountModal';
import { useToast } from './ui/use-toast';

/**
 * Provider Logo Wrapper with size variants
 */
function ProviderLogoSized({ 
  provider, 
  size = 'md'
}: { 
  provider: ProviderType; 
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return <ProviderLogo provider={provider} className={sizeClasses[size]} />;
}

/**
 * Account Selector Component
 * 
 * Displays at the top of the sidebar, allowing users to switch between:
 * - Account Overview (aggregated view of all accounts)
 * - Individual Master Accounts
 * - Sub-Accounts under each Master
 */
// Client user type for the dropdown
interface ClientUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  displayName: string;
  assignedPhoneNumber?: string;
}

export default function AccountSelector() {
  const {
    currentAccount,
    isOverviewMode,
    accounts,
    overview,
    isLoading,
    selectAccount,
    selectOverview,
    refreshAccounts,
  } = useAccount();

  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showSubAccountModal, setShowSubAccountModal] = useState(false);
  const [selectedParentAccount, setSelectedParentAccount] = useState<Account | null>(null);
  const [connectProvider, setConnectProvider] = useState<ProviderType | undefined>(undefined);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Client users state
  const [clientUsers, setClientUsers] = useState<ClientUser[]>([]);
  const [selectedClientUser, setSelectedClientUser] = useState<ClientUser | null>(null);
  const [isLoadingClients, setIsLoadingClients] = useState(false);

  // Fetch client users
  useEffect(() => {
    const fetchClientUsers = async () => {
      setIsLoadingClients(true);
      try {
        const response = await fetch('/api/users/clients');
        if (response.ok) {
          const data = await response.json();
          setClientUsers(data);
        }
      } catch (error) {
        console.error('Error fetching client users:', error);
      } finally {
        setIsLoadingClients(false);
      }
    };
    
    fetchClientUsers();
  }, []);

  // Handle client user selection
  const handleSelectClientUser = (user: ClientUser | null) => {
    setSelectedClientUser(user);
    if (user) {
      // Store selected client in localStorage for filtering data
      localStorage.setItem('selectedClientUserId', user.id.toString());
    } else {
      localStorage.removeItem('selectedClientUserId');
    }
    setIsOpen(false);
  };

  // Sync sub-accounts from Twilio
  const handleSyncSubAccounts = async (account: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSyncing(account.id);
    
    try {
      const response = await fetch(`/api/accounts/${account.id}/sync-subaccounts`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync sub-accounts');
      }
      
      toast({
        title: 'Sub-accounts synced',
        description: data.message || `Synced sub-accounts from Twilio`,
      });
      
      // Refresh accounts list
      await refreshAccounts();
      
      // Expand the master account to show synced sub-accounts
      setExpandedMasters(prev => new Set([...Array.from(prev), account.id]));
    } catch (err: any) {
      console.error('Error syncing sub-accounts:', err);
      toast({
        title: 'Sync failed',
        description: err.message || 'Failed to sync sub-accounts from Twilio',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(null);
    }
  };

  // Handle connect button click
  const handleConnectClick = (provider?: ProviderType) => {
    setConnectProvider(provider);
    setShowConnectModal(true);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle master account expansion
  const toggleMasterExpansion = (masterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMasters(prev => {
      const next = new Set(prev);
      if (next.has(masterId)) {
        next.delete(masterId);
      } else {
        next.add(masterId);
      }
      return next;
    });
  };

  // Handle account selection
  const handleSelectAccount = (account: Account | null) => {
    if (account) {
      selectAccount(account.id);
    } else {
      selectOverview();
    }
    setIsOpen(false);
  };

  // Get display info for current selection
  const getDisplayInfo = () => {
    if (isOverviewMode || !currentAccount) {
      return {
        title: 'Account Overview',
        subtitle: overview 
          ? `${overview.totalAccounts} accounts • $${overview.totalMonthlySpend.toFixed(2)}/mo`
          : 'All accounts',
        icon: <LayoutGrid className="w-5 h-5 text-blue-500" />,
        isOverview: true,
      };
    }

    const provider = getProviderInfo(currentAccount.provider);
    return {
      title: currentAccount.name,
      subtitle: `${provider.name} • ${currentAccount.phoneNumberCount} numbers`,
      icon: <ProviderLogoSized provider={currentAccount.provider} size="md" />,
      isOverview: false,
    };
  };

  const displayInfo = getDisplayInfo();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#2a3a9e] hover:bg-[#3448b8] transition-colors text-left"
        disabled={isLoading}
      >
        <div className="flex items-center min-w-0 flex-1">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#3a4ac0] flex items-center justify-center mr-3">
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              displayInfo.icon
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">
              {displayInfo.title}
            </div>
            <div className="text-xs text-blue-200 truncate">
              {displayInfo.subtitle}
            </div>
          </div>
        </div>
        <ChevronDown 
          className={`w-5 h-5 text-blue-200 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {/* Overview Option */}
          <div
            onClick={() => handleSelectAccount(null)}
            className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
              isOverviewMode 
                ? 'bg-blue-50 border-l-4 border-blue-500' 
                : 'hover:bg-gray-50 border-l-4 border-transparent'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-3">
              <LayoutGrid className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">Account Overview</div>
              <div className="text-xs text-gray-500">
                {overview ? `${overview.totalAccounts} accounts • $${overview.totalMonthlySpend.toFixed(2)}/mo` : 'View all accounts'}
              </div>
            </div>
            {isOverviewMode && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100">
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
              Accounts
            </div>
          </div>

          {/* Account List */}
          {accounts.map(masterAccount => (
            <div key={masterAccount.id}>
              {/* Master Account */}
              <div
                className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                  currentAccount?.id === masterAccount.id
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                }`}
              >
                {/* Expand/Collapse Toggle */}
                {masterAccount.children && masterAccount.children.length > 0 && (
                  <button
                    onClick={(e) => toggleMasterExpansion(masterAccount.id, e)}
                    className="p-1 hover:bg-gray-200 rounded mr-1 flex-shrink-0"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        expandedMasters.has(masterAccount.id) ? 'rotate-90' : ''
                      }`} 
                    />
                  </button>
                )}
                
                {/* Account Info */}
                <div 
                  className="flex items-center flex-1 min-w-0"
                  onClick={() => handleSelectAccount(masterAccount)}
                >
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center mr-3 flex-shrink-0"
                    style={{ backgroundColor: getProviderInfo(masterAccount.provider).bgColor }}
                  >
                    <ProviderLogoSized provider={masterAccount.provider} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {masterAccount.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {getProviderInfo(masterAccount.provider).name} • {masterAccount.phoneNumberCount} numbers
                    </div>
                  </div>
                </div>

                {/* Sync Sub-Accounts Button */}
                {masterAccount.type === 'master' && (
                  <button
                    onClick={(e) => handleSyncSubAccounts(masterAccount, e)}
                    disabled={isSyncing === masterAccount.id}
                    className="p-1.5 hover:bg-green-100 rounded text-gray-400 hover:text-green-600 transition-colors flex-shrink-0 ml-1 disabled:opacity-50"
                    title="Sync Sub-Accounts from Twilio"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing === masterAccount.id ? 'animate-spin' : ''}`} />
                  </button>
                )}

                {/* Create Sub-Account Button */}
                {masterAccount.type === 'master' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedParentAccount(masterAccount);
                      setShowSubAccountModal(true);
                      setIsOpen(false);
                    }}
                    className="p-1.5 hover:bg-blue-100 rounded text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0 ml-1"
                    title="Create Sub-Account"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}

                {/* Selection Indicator */}
                {currentAccount?.id === masterAccount.id && (
                  <Check className="w-4 h-4 text-blue-500 flex-shrink-0 ml-2" />
                )}
              </div>

              {/* Sub-Accounts */}
              {masterAccount.children && 
               masterAccount.children.length > 0 && 
               expandedMasters.has(masterAccount.id) && (
                <div className="bg-gray-50">
                  {masterAccount.children.map(subAccount => (
                    <div
                      key={subAccount.id}
                      onClick={() => handleSelectAccount(subAccount)}
                      className={`flex items-center pl-12 pr-4 py-2.5 cursor-pointer transition-colors ${
                        currentAccount?.id === subAccount.id
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : 'hover:bg-gray-100 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center mr-3 flex-shrink-0">
                        <Building2 className="w-3 h-3 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">{subAccount.name}</div>
                        <div className="text-xs text-gray-400">
                          {subAccount.phoneNumberCount} numbers • ${subAccount.monthlySpend.toFixed(2)}/mo
                        </div>
                      </div>
                      {currentAccount?.id === subAccount.id && (
                        <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Empty State */}
          {accounts.length === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-gray-500">
              <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No accounts configured</p>
            </div>
          )}

          {/* Client Users Section */}
          {clientUsers.length > 0 && (
            <>
              {/* Divider line between Accounts and Client Users */}
              <div className="my-2 mx-3 border-t-2 border-gray-300" />
              
              <div className="border-t border-gray-100">
                <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-green-50 flex items-center border-l-4 border-green-500">
                  <Users className="w-3 h-3 mr-2 text-green-600" />
                  Client Users
                </div>
              </div>
              
              {clientUsers.map(user => (
                <div
                  key={`client-${user.id}`}
                  onClick={() => handleSelectClientUser(user)}
                  className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                    selectedClientUser?.id === user.id
                      ? 'bg-green-50 border-l-4 border-green-500'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mr-3 flex-shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.displayName || user.username}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {user.email}
                      {user.assignedPhoneNumber && ` • ${user.assignedPhoneNumber}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.status === 'active' ? (
                      <span className="w-2 h-2 rounded-full bg-green-500" title="Active" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-300" title={user.status} />
                    )}
                    {selectedClientUser?.id === user.id && (
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))}
              
              {/* Clear client selection option */}
              {selectedClientUser && (
                <div
                  onClick={() => handleSelectClientUser(null)}
                  className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-50 border-l-4 border-transparent text-gray-500"
                >
                  <span className="text-xs">Clear client selection</span>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="border-t border-gray-100 bg-gray-50">
            {/* Connect Account Section */}
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Connect Provider</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleConnectClick('twilio')}
                  className="flex-1 flex items-center justify-center px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors group"
                >
                  <TwilioLogo className="w-5 h-5 mr-2" />
                  <span className="text-xs font-medium text-gray-700 group-hover:text-red-600">Twilio</span>
                </button>
                <button 
                  onClick={() => handleConnectClick('commio')}
                  className="flex-1 flex items-center justify-center px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
                >
                  <CommioLogo className="w-5 h-5 mr-2" />
                  <span className="text-xs font-medium text-gray-700 group-hover:text-indigo-600">Commio</span>
                </button>
              </div>
            </div>
            
            {/* Manage Link */}
            <div className="p-2">
              <button className="w-full flex items-center px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                <Settings className="w-4 h-4 mr-2" />
                Manage Accounts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Account Modal */}
      <ConnectAccountModal 
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        initialProvider={connectProvider}
      />

      {/* Sub-Account Modal */}
      {selectedParentAccount && (
        <SubAccountModal
          isOpen={showSubAccountModal}
          onClose={() => {
            setShowSubAccountModal(false);
            setSelectedParentAccount(null);
          }}
          parentAccount={selectedParentAccount}
        />
      )}
    </div>
  );
}
