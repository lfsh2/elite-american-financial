import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * Account Types
 * Following Twilio's hierarchy: Organization → Master Account → Sub-Account
 */

export type AccountType = 'master' | 'subaccount';
export type AccountStatus = 'active' | 'suspended' | 'closed';
export type ProviderType = 'twilio' | 'commio' | 'bandwidth';

export interface PhoneNumber {
  id?: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
  status?: string;
  dateCreated?: string;
}

export interface Account {
  id: string;
  parentId: string | null;
  organizationId: string;
  provider: ProviderType;
  type: AccountType;
  name: string;
  friendlyName?: string;
  status: AccountStatus;
  accountSid?: string;
  phoneNumberCount: number;
  monthlySpend: number;
  phoneNumbers?: PhoneNumber[];
  children?: Account[];
  createdAt: string;
}

export interface AccountOverview {
  totalAccounts: number;
  totalPhoneNumbers: number;
  totalMonthlySpend: number;
  accounts: Account[];
}

interface AccountContextState {
  // Current selection
  currentAccount: Account | null;
  isOverviewMode: boolean;
  
  // All accounts
  accounts: Account[];
  overview: AccountOverview | null;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  selectAccount: (accountId: string | null) => void;
  selectOverview: () => void;
  refreshAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextState | undefined>(undefined);

const STORAGE_KEY = 'unicomms_selected_account';

/**
 * Provider logo URLs (official logos)
 */
export const PROVIDER_LOGOS: Record<ProviderType, string> = {
  twilio: 'https://www.twilio.com/assets/icons/twilio-icon.svg',
  commio: 'https://commio.com/wp-content/uploads/2023/03/commio-logo-icon.svg',
  bandwidth: 'https://www.bandwidth.com/wp-content/themes/developer-starter-theme/images/bandwidth-logo-icon.svg',
};

/**
 * Get provider display info
 */
export const getProviderInfo = (provider: ProviderType) => {
  const providers: Record<ProviderType, { name: string; color: string; bgColor: string; logo: string }> = {
    twilio: { 
      name: 'Twilio', 
      color: '#F22F46', 
      bgColor: '#FEE2E2',
      logo: PROVIDER_LOGOS.twilio
    },
    commio: { 
      name: 'Commio', 
      color: '#6366F1', 
      bgColor: '#E0E7FF',
      logo: PROVIDER_LOGOS.commio
    },
    bandwidth: { 
      name: 'Bandwidth', 
      color: '#079CEE', 
      bgColor: '#DBEAFE',
      logo: PROVIDER_LOGOS.bandwidth
    },
  };
  return providers[provider] || { name: provider, color: '#6B7280', bgColor: '#F3F4F6', logo: '' };
};

/**
 * Account Provider Component
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [isOverviewMode, setIsOverviewMode] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all accounts from API
   */
  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/accounts');
      
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      
      const data = await response.json();
      setAccounts(data.accounts || []);
      setOverview(data.overview || null);
      
      // Restore previously selected account
      const savedAccountId = localStorage.getItem(STORAGE_KEY);
      if (savedAccountId && savedAccountId !== 'overview') {
        const savedAccount = findAccountById(data.accounts, savedAccountId);
        if (savedAccount) {
          setCurrentAccount(savedAccount);
          setIsOverviewMode(false);
        }
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // No longer falling back to mock data - show error instead
      setAccounts([]);
      setOverview(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Select a specific account
   */
  const selectAccount = useCallback((accountId: string | null) => {
    if (!accountId) {
      setCurrentAccount(null);
      setIsOverviewMode(true);
      localStorage.setItem(STORAGE_KEY, 'overview');
      return;
    }

    const account = findAccountById(accounts, accountId);
    if (account) {
      setCurrentAccount(account);
      setIsOverviewMode(false);
      localStorage.setItem(STORAGE_KEY, accountId);
    }
  }, [accounts]);

  /**
   * Switch to overview mode
   */
  const selectOverview = useCallback(() => {
    setCurrentAccount(null);
    setIsOverviewMode(true);
    localStorage.setItem(STORAGE_KEY, 'overview');
  }, []);

  /**
   * Refresh accounts data
   */
  const refreshAccounts = useCallback(async () => {
    await fetchAccounts();
  }, [fetchAccounts]);

  // Initial fetch
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const value: AccountContextState = {
    currentAccount,
    isOverviewMode,
    accounts,
    overview,
    isLoading,
    error,
    selectAccount,
    selectOverview,
    refreshAccounts,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

/**
 * Hook to access account context
 */
export function useAccount() {
  const context = useContext(AccountContext);
  
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  
  return context;
}

/**
 * Helper: Find account by ID (including nested children)
 */
function findAccountById(accounts: Account[], id: string): Account | null {
  for (const account of accounts) {
    if (account.id === id) {
      return account;
    }
    if (account.children) {
      const found = findAccountById(account.children, id);
      if (found) return found;
    }
  }
  return null;
}

export default AccountContext;
