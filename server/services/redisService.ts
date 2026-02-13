/**
 * Redis Service
 * 
 * Provides Redis caching layer for analytics data with stale-while-revalidate pattern.
 * Dramatically improves dashboard load times by caching expensive API calls.
 */

import Redis from 'ioredis';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Check if using TLS (rediss://)
const useTLS = REDIS_URL.startsWith('rediss://');

// Cache TTL configurations (in seconds)
export const CACHE_TTL = {
  METRICS: 30,               // 30 seconds for real-time metrics
  ANALYTICS: 60,             // 1 minute for analytics data
  CHART_DATA: 10 * 60,       // 10 minutes for chart data (6 months)
  MESSAGES_RECENT: 15,       // 15 seconds for recent messages
  PHONE_NUMBERS: 10 * 60,    // 10 minutes for phone numbers
  ACCOUNT_INFO: 10 * 60,     // 10 minutes for account info
};

// Stale TTL - how long to serve stale data while revalidating
export const STALE_TTL = {
  METRICS: 60,               // Serve stale metrics for 1 min while refreshing
  ANALYTICS: 2 * 60,         // Serve stale analytics for 2 min
  CHART_DATA: 30 * 60,       // Serve stale chart data for 30 min
};

class RedisService {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    // Redis disabled — using in-memory cache only
    console.log('[Redis] Disabled — using in-memory cache fallback');
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Generate cache key for analytics data
   */
  static generateKey(type: string, accountId: string | number, ...parts: string[]): string {
    const keyParts = ['textflow', type, String(accountId), ...parts];
    return keyParts.join(':');
  }

  /**
   * Get cached data with stale-while-revalidate support
   * Returns { data, isStale } where isStale indicates if background refresh is needed
   */
  async getWithStale<T>(key: string): Promise<{ data: T | null; isStale: boolean }> {
    if (!this.isAvailable()) {
      console.log('[Redis] Not available for get:', key);
      return { data: null, isStale: false };
    }

    try {
      const cached = await this.client!.get(key);
      if (!cached) {
        console.log('[Redis] Key not found:', key);
        return { data: null, isStale: false };
      }
      console.log('[Redis] Key found:', key, 'size:', cached.length);

      const parsed = JSON.parse(cached);
      const now = Date.now();
      const isStale = parsed._staleAfter && now > parsed._staleAfter;

      return {
        data: parsed.data as T,
        isStale,
      };
    } catch (error) {
      console.error('[Redis] Get error:', error);
      return { data: null, isStale: false };
    }
  }

  /**
   * Get cached data (simple get without stale check)
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cached = await this.client!.get(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      return parsed.data as T;
    } catch (error) {
      console.error('[Redis] Get error:', error);
      return null;
    }
  }

  /**
   * Set cached data with TTL and stale time
   */
  async set<T>(
    key: string,
    data: T,
    ttlSeconds: number,
    staleTtlSeconds?: number
  ): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const now = Date.now();
      const cacheData = {
        data,
        _cachedAt: now,
        _staleAfter: staleTtlSeconds ? now + (staleTtlSeconds * 1000) : undefined,
      };

      // Use the longer TTL (stale TTL) for actual expiration
      const actualTtl = staleTtlSeconds ? Math.max(ttlSeconds, staleTtlSeconds) : ttlSeconds;
      
      const jsonData = JSON.stringify(cacheData);
      console.log(`[Redis] SET ${key} - size: ${(jsonData.length / 1024).toFixed(1)}KB, TTL: ${actualTtl}s`);
      
      await this.client!.setex(key, actualTtl, jsonData);
      return true;
    } catch (error) {
      console.error('[Redis] Set error:', error);
      return false;
    }
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      console.error('[Redis] Delete error:', error);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;

      const deleted = await this.client!.del(...keys);
      return deleted;
    } catch (error) {
      console.error('[Redis] Delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Invalidate all cache for an account
   */
  async invalidateAccount(accountId: string | number): Promise<void> {
    const pattern = `textflow:*:${accountId}:*`;
    const deleted = await this.deletePattern(pattern);
    console.log(`[Redis] Invalidated ${deleted} keys for account ${accountId}`);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ keys: number; memory: string } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const info = await this.client!.info('memory');
      const keys = await this.client!.dbsize();
      
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';

      return { keys, memory };
    } catch (error) {
      console.error('[Redis] Stats error:', error);
      return null;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();

// Export cache key generators for common use cases
export const CacheKeys = {
  metrics: (accountId: string | number) => 
    RedisService.generateKey('metrics', accountId),
  
  analytics: (accountId: string | number) => 
    RedisService.generateKey('analytics', accountId),
  
  chartData: (accountId: string | number, period: string) => 
    RedisService.generateKey('chart', accountId, period),
  
  messages: (accountId: string | number, period: string) => 
    RedisService.generateKey('messages', accountId, period),
  
  calls: (accountId: string | number, period: string) => 
    RedisService.generateKey('calls', accountId, period),
  
  phoneNumbers: (accountId: string | number) => 
    RedisService.generateKey('phones', accountId),
  
  accountInfo: (accountId: string | number) => 
    RedisService.generateKey('account', accountId),
  
  aggregatedMetrics: (userId: number) => 
    RedisService.generateKey('aggregated', userId, 'metrics'),
};
