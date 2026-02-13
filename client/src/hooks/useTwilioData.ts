import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '../contexts/AccountContext';

export interface TwilioMetrics {
  messages: {
    sentToday: number;
    receivedToday: number;
    sentYesterday: number;
    sentThisWeek: number;
    sentThisMonth: number;
    deliveryRate: number;
    failed: number;
  };
  calls: {
    today: number;
    thisWeek: number;
    durationToday: number;
  };
  spend: {
    today: number;
    thisMonth: number;
    avgPerMessage: number;
  };
  account: {
    status: string;
    phoneNumbers: number;
  };
  generatedAt: string;
}

export interface TwilioMessage {
  sid: string;
  to: string;
  from: string;
  body: string;
  status: string;
  direction: string;
  dateSent: string;
  dateCreated: string;
  price: string | null;
  numSegments: string;
  errorCode: number | null;
  errorMessage: string | null;
}

export interface TwilioCall {
  sid: string;
  to: string;
  from: string;
  status: string;
  direction: string;
  duration: string;
  startTime: string;
  endTime: string;
  price: string | null;
}

export interface TwilioAnalytics {
  account: {
    sid: string;
    friendlyName: string;
    status: string;
    type: string;
    dateCreated: string;
  };
  phoneNumbers: Array<{
    phoneNumber: string;
    friendlyName: string;
    capabilities: { sms: boolean; voice: boolean; mms: boolean };
    dateCreated: string;
  }>;
  messages: {
    today: TwilioMessage[];
    yesterday: TwilioMessage[];
    thisWeek: TwilioMessage[];
    thisMonth: TwilioMessage[];
  };
  calls: {
    today: TwilioCall[];
    yesterday: TwilioCall[];
    thisWeek: TwilioCall[];
    thisMonth: TwilioCall[];
  };
  metrics: {
    totalMessagesSentToday: number;
    totalMessagesReceivedToday: number;
    totalMessagesSentYesterday: number;
    totalMessagesReceivedYesterday: number;
    totalMessagesSentThisWeek: number;
    totalMessagesSentThisMonth: number;
    deliveredToday: number;
    failedToday: number;
    deliveryRateToday: number;
    totalCallsToday: number;
    totalCallsThisWeek: number;
    totalCallDurationToday: number;
    totalSpendToday: number;
    totalSpendThisMonth: number;
    averageMessageCost: number;
  };
  generatedAt: string;
}

export function useTwilioMetrics() {
  const [metrics, setMetrics] = useState<TwilioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/twilio/metrics');
        if (!response.ok) throw new Error('Failed to fetch metrics');
        const data = await response.json();
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  return { metrics, loading, error, refresh: () => setLoading(true) };
}

export function useTwilioAnalytics() {
  const [analytics, setAnalytics] = useState<TwilioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch('/api/twilio/analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const data = await response.json();
        setAnalytics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/twilio/analytics');
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return { analytics, loading, error, refresh };
}

// Helper to format duration from seconds
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// Helper to format phone number
export function formatPhoneNumber(number: string): string {
  if (number.startsWith('+1') && number.length === 12) {
    return `(${number.substring(2, 5)}) ${number.substring(5, 8)}-${number.substring(8)}`;
  }
  return number;
}

// Helper to format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

// Helper to format large numbers
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) {
    return '0';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// ============================================
// ACCOUNT-SCOPED DATA HOOKS
// ============================================

export interface AccountMetrics {
  totalMessagesSentToday: number;
  totalMessagesSentThisWeek: number;
  totalMessagesSentThisMonth: number;
  totalMessagesReceivedToday: number;
  totalCallsToday: number;
  totalCallsThisWeek: number;
  totalCallDurationToday: number;
  totalSpendToday: number;
  totalSpendThisWeek: number;
  totalSpendThisMonth: number;
  deliveryRate: number;
  failureRate: number;
  totalPhoneNumbers: number;
  totalAccounts: number;
}

export interface AccountDataContext {
  userId: number;
  accountId?: string | number;
  isOverviewMode: boolean;
}

export interface AccountAnalyticsResult {
  context: AccountDataContext;
  accounts: Array<{
    accountId: string;
    accountName: string;
    provider: string;
    analytics: TwilioAnalytics;
  }>;
  aggregatedMetrics: AccountMetrics;
  messages: {
    today: TwilioMessage[];
    thisWeek: TwilioMessage[];
    thisMonth: TwilioMessage[];
  };
  calls: {
    today: TwilioCall[];
    thisWeek: TwilioCall[];
    thisMonth: TwilioCall[];
  };
}

/**
 * Hook for fetching account-scoped analytics data
 * Automatically uses the currently selected account from context
 */
export function useAccountAnalytics() {
  const { currentAccount, isOverviewMode } = useAccount();
  const [data, setData] = useState<AccountAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (useCache = true, bypassServerCache = false) => {
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      if (isOverviewMode) {
        params.set('overview', 'true');
      } else if (currentAccount) {
        params.set('accountId', currentAccount.id);
      }
      
      if (bypassServerCache) {
        params.set('noCache', 'true');
      }

      // Check sessionStorage cache first for instant load
      const cacheKey = `dashboard_analytics_${isOverviewMode ? 'overview' : currentAccount?.id || 'default'}`;
      const cacheExpiry = `${cacheKey}_expiry`;
      
      if (useCache) {
        const cached = sessionStorage.getItem(cacheKey);
        const expiry = sessionStorage.getItem(cacheExpiry);
        if (cached && expiry && Date.now() < parseInt(expiry)) {
          console.log('[Dashboard] Using cached data');
          setData(JSON.parse(cached));
          setLoading(false);
          // Refresh in background
          fetchData(false);
          return;
        }
      }

      setLoading(true);
      const response = await fetch(`/api/data/analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      
      const result = await response.json();
      setData(result);
      
      // Cache for 30 seconds
      sessionStorage.setItem(cacheKey, JSON.stringify(result));
      sessionStorage.setItem(cacheExpiry, String(Date.now() + 30 * 1000));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds for near real-time updates
    const interval = setInterval(() => fetchData(false), 30 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // refresh() always bypasses ALL cache layers for instant fresh data
  const refresh = useCallback(() => {
    // Clear sessionStorage cache
    const cacheKey = `dashboard_analytics_${isOverviewMode ? 'overview' : currentAccount?.id || 'default'}`;
    sessionStorage.removeItem(cacheKey);
    sessionStorage.removeItem(`${cacheKey}_expiry`);
    return fetchData(false, true);
  }, [fetchData, isOverviewMode, currentAccount]);

  return { 
    data, 
    loading, 
    error, 
    refresh,
    isOverviewMode,
    currentAccount,
  };
}

/**
 * Hook for fetching account-scoped metrics
 */
export function useAccountMetrics() {
  const { currentAccount, isOverviewMode } = useAccount();
  const [metrics, setMetrics] = useState<AccountMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      
      if (isOverviewMode) {
        params.set('overview', 'true');
      } else if (currentAccount) {
        params.set('accountId', currentAccount.id);
      }

      const response = await fetch(`/api/data/metrics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      
      const result = await response.json();
      setMetrics(result.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode]);

  useEffect(() => {
    fetchMetrics();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return { 
    metrics, 
    loading, 
    error, 
    refresh: fetchMetrics,
    isOverviewMode,
    currentAccount,
  };
}

/**
 * Hook for fetching account-scoped messages
 */
export function useAccountMessages(period: 'today' | 'thisWeek' | 'thisMonth' = 'thisMonth') {
  const { currentAccount, isOverviewMode } = useAccount();
  const [messages, setMessages] = useState<TwilioMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ period });
      
      if (isOverviewMode) {
        params.set('overview', 'true');
      } else if (currentAccount) {
        params.set('accountId', currentAccount.id);
      }

      const response = await fetch(`/api/data/messages?${params}`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      
      const result = await response.json();
      setMessages(result.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode, period]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return { 
    messages, 
    loading, 
    error, 
    refresh: fetchMessages,
    isOverviewMode,
    currentAccount,
  };
}

/**
 * Hook for fetching account-scoped calls
 */
export function useAccountCalls(period: 'today' | 'thisWeek' | 'thisMonth' = 'thisMonth') {
  const { currentAccount, isOverviewMode } = useAccount();
  const [calls, setCalls] = useState<TwilioCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ period });
      
      if (isOverviewMode) {
        params.set('overview', 'true');
      } else if (currentAccount) {
        params.set('accountId', currentAccount.id);
      }

      const response = await fetch(`/api/data/calls?${params}`);
      if (!response.ok) throw new Error('Failed to fetch calls');
      
      const result = await response.json();
      setCalls(result.calls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode, period]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return { 
    calls, 
    loading, 
    error, 
    refresh: fetchCalls,
    isOverviewMode,
    currentAccount,
  };
}

/**
 * Phone number interface
 */
export interface AccountPhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
  status: string;
  dateCreated: string;
}

/**
 * Hook for fetching phone numbers for the selected account
 */
export function useAccountPhoneNumbers() {
  const { currentAccount, isOverviewMode, accounts } = useAccount();
  const [phoneNumbers, setPhoneNumbers] = useState<AccountPhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPhoneNumbers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In overview mode, aggregate phone numbers from all accounts
      if (isOverviewMode) {
        // Wait for accounts to load before fetching
        if (accounts.length === 0) {
          setLoading(false);
          return;
        }
        
        const allNumbers: AccountPhoneNumber[] = [];
        
        for (const account of accounts) {
          try {
            const response = await fetch(`/api/accounts/${account.id}/phone-numbers`);
            if (response.ok) {
              const data = await response.json();
              // Add account info and provider to each number
              const numbersWithAccount = data.phoneNumbers.map((pn: any) => ({
                ...pn,
                _accountId: account.id,
                _accountName: account.name,
                _provider: account.provider,
              }));
              allNumbers.push(...numbersWithAccount);
            }
          } catch (e) {
            console.error(`Error fetching numbers for ${account.id}:`, e);
          }
        }
        
        setPhoneNumbers(allNumbers);
      } else if (currentAccount) {
        // Fetch for specific account
        const response = await fetch(`/api/accounts/${currentAccount.id}/phone-numbers`);
        if (!response.ok) throw new Error('Failed to fetch phone numbers');
        
        const data = await response.json();
        setPhoneNumbers(data.phoneNumbers);
      } else {
        setPhoneNumbers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode, accounts]);

  useEffect(() => {
    fetchPhoneNumbers();
  }, [fetchPhoneNumbers]);

  return { 
    phoneNumbers, 
    loading, 
    error, 
    refresh: fetchPhoneNumbers,
    isOverviewMode,
    currentAccount,
    total: phoneNumbers.length,
  };
}
