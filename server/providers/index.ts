/**
 * Provider Factory
 * 
 * Creates and manages communication provider instances.
 * This is the main entry point for working with providers.
 */

import type { 
  ICommunicationProvider, 
  ProviderCode, 
  ProviderCredentials,
  ProviderConfig 
} from './types';
import { TwilioProvider } from './twilio.provider';
import { CommioProvider } from './commio.provider';
import { BandwidthProvider } from './bandwidth.provider';

// Re-export types
export * from './types';
export { TwilioProvider } from './twilio.provider';
export { CommioProvider } from './commio.provider';
export { BandwidthProvider } from './bandwidth.provider';

/**
 * Provider Factory Class
 * 
 * Manages creation and caching of provider instances.
 */
class ProviderFactory {
  private cache = new Map<string, ICommunicationProvider>();

  /**
   * Create a provider instance
   */
  create(config: ProviderConfig): ICommunicationProvider {
    const cacheKey = `${config.code}:${config.credentials.accountSid}`;
    
    // Return cached instance if available
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Create new instance
    const provider = this.createInstance(config.code, config.credentials);
    
    // Cache it
    this.cache.set(cacheKey, provider);
    
    return provider;
  }

  /**
   * Create provider instance by code
   */
  private createInstance(code: ProviderCode, credentials: ProviderCredentials): ICommunicationProvider {
    switch (code) {
      case 'twilio':
        return new TwilioProvider(credentials);
      case 'commio':
        return new CommioProvider(credentials);
      case 'bandwidth':
        return new BandwidthProvider(credentials);
      default:
        throw new Error(`Unknown provider: ${code}`);
    }
  }

  /**
   * Create provider from environment variables (for default Twilio)
   */
  createFromEnv(): ICommunicationProvider | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return null;
    }

    return this.create({
      code: 'twilio',
      credentials: { accountSid, authToken },
    });
  }

  /**
   * Clear cached provider instance
   */
  clearCache(code: ProviderCode, accountSid: string): void {
    const cacheKey = `${code}:${accountSid}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cached instances
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get list of supported providers
   */
  getSupportedProviders(): { code: ProviderCode; name: string; active: boolean }[] {
    return [
      { code: 'twilio', name: 'Twilio', active: true },
      { code: 'commio', name: 'Commio', active: true },
      { code: 'bandwidth', name: 'Bandwidth', active: true },
    ];
  }

  /**
   * Validate credentials for a provider
   */
  async validateCredentials(code: ProviderCode, credentials: ProviderCredentials): Promise<boolean> {
    try {
      const provider = this.createInstance(code, credentials);
      return await provider.validateCredentials();
    } catch (error) {
      console.error(`Credential validation failed for ${code}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const providerFactory = new ProviderFactory();

/**
 * Helper function to get provider for an account
 */
export async function getProviderForAccount(
  accountId: number,
  getCredentials: (id: number) => Promise<{ code: ProviderCode; credentials: ProviderCredentials } | null>
): Promise<ICommunicationProvider | null> {
  const config = await getCredentials(accountId);
  if (!config) return null;
  
  return providerFactory.create({
    code: config.code,
    credentials: config.credentials,
    accountId,
  });
}
