/**
 * Custom hook for phone number health monitoring
 * 
 * Provides data fetching, caching, and refresh capabilities for
 * phone number health checks across multiple providers.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@/contexts/AccountContext';

export interface PhoneNumberHealth {
  phoneNumber: string;
  friendlyName: string;
  provider: 'twilio' | 'commio';
  accountId: string;
  accountName: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  metrics: {
    apiStatus: 'active' | 'inactive' | 'unknown';
    deliveryRate: number | null;
    lastActivity: Date | null;
    errorCount: number;
    capabilities: {
      voice: boolean;
      sms: boolean;
      mms: boolean;
    };
    configurationComplete: boolean;
  };
  issues: string[];
  lastChecked: Date;
}

export interface HealthCheckSummary {
  totalNumbers: number;
  byProvider: {
    twilio: number;
    commio: number;
  };
  byStatus: {
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
  };
  averageHealthScore: number;
  phoneNumbers: PhoneNumberHealth[];
}

const CACHE_KEY = 'phone_health_data';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function usePhoneHealth() {
  const { currentAccount, isOverviewMode } = useAccount();
  const [data, setData] = useState<HealthCheckSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchHealthData = useCallback(async (useCache = true) => {
    setError(null);

    try {
      // Check cache first
      if (useCache) {
        const cached = sessionStorage.getItem(CACHE_KEY);
        const cacheTime = sessionStorage.getItem(`${CACHE_KEY}_time`);
        
        if (cached && cacheTime) {
          const cacheAge = Date.now() - parseInt(cacheTime);
          if (cacheAge < CACHE_DURATION) {
            const cachedData = JSON.parse(cached);
            setData(cachedData);
            setLastFetch(new Date(parseInt(cacheTime)));
            setLoading(false);
            return;
          }
        }
      }

      setLoading(true);

      // Build query params
      const params = new URLSearchParams();
      if (!isOverviewMode && currentAccount) {
        params.set('accountId', currentAccount.id);
      }

      const response = await fetch(`/api/analytics/phone-health?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch phone health data');
      }

      const result = await response.json();

      // Cache the result
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
      sessionStorage.setItem(`${CACHE_KEY}_time`, Date.now().toString());

      setData(result);
      setLastFetch(new Date());
    } catch (err) {
      console.error('[usePhoneHealth] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [currentAccount, isOverviewMode]);

  const refresh = useCallback(() => {
    // Clear cache and fetch fresh data
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(`${CACHE_KEY}_time`);
    return fetchHealthData(false);
  }, [fetchHealthData]);

  const refreshAccount = useCallback(async (accountId: number) => {
    try {
      const response = await fetch(`/api/analytics/phone-health/refresh/${accountId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to refresh account health');
      }

      // Refresh the main data after account refresh
      await refresh();
    } catch (err) {
      console.error('[usePhoneHealth] Error refreshing account:', err);
      throw err;
    }
  }, [refresh]);

  // Initial fetch
  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHealthData(false);
    }, CACHE_DURATION);

    return () => clearInterval(interval);
  }, [fetchHealthData]);

  return {
    data,
    loading,
    error,
    lastFetch,
    refresh,
    refreshAccount,
  };
}

export function usePhoneNumberHealth(phoneNumber: string, accountId: number) {
  const [data, setData] = useState<PhoneNumberHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/analytics/phone-health/${encodeURIComponent(phoneNumber)}?accountId=${accountId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch phone number health');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('[usePhoneNumberHealth] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, accountId]);

  useEffect(() => {
    if (phoneNumber && accountId) {
      fetchData();
    }
  }, [fetchData, phoneNumber, accountId]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}
