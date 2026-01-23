import { db } from '../db.js';
import { 
  providers, 
  organizations, 
  accounts, 
  accountPhoneNumbers, 
  accountUsers,
  users,
  type Provider,
  type Organization,
  type Account,
  type AccountPhoneNumber,
  type InsertAccount
} from '../../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { providerFactory, type ProviderCode, type ICommunicationProvider } from '../providers';

/**
 * Account Service
 * Handles all account-related business logic
 */
class AccountService {
  
  /**
   * Initialize default providers if they don't exist
   */
  async initializeProviders(): Promise<void> {
    const existingProviders = await db.select().from(providers);
    
    if (existingProviders.length === 0) {
      console.log('Initializing default providers...');
      await db.insert(providers).values([
        { code: 'twilio', name: 'Twilio' },
        { code: 'commio', name: 'Commio' },
        { code: 'bandwidth', name: 'Bandwidth' },
      ]);
      console.log('Default providers created');
    }
  }

  /**
   * Get all providers
   */
  async getProviders(): Promise<Provider[]> {
    return db.select().from(providers).where(eq(providers.isActive, true));
  }

  /**
   * Get provider by code
   */
  async getProviderByCode(code: string): Promise<Provider | null> {
    console.log('Looking up provider:', code);
    const result = await db.select().from(providers).where(eq(providers.code, code));
    console.log('Provider lookup result:', result[0] ? 'found' : 'not found');
    return result[0] || null;
  }

  /**
   * Get or create default organization for a user
   */
  async getOrCreateOrganization(userId: number): Promise<Organization> {
    // Check if user already has an organization
    const existing = await db.select().from(organizations).where(eq(organizations.ownerUserId, userId));
    
    if (existing.length > 0) {
      return existing[0];
    }

    // Get user info for naming
    const user = await db.select().from(users).where(eq(users.id, userId));
    const userName = user[0]?.firstName || 'User';

    // Create default organization
    const [org] = await db.insert(organizations).values({
      name: `${userName}'s Workspace`,
      slug: `workspace-${userId}-${Date.now()}`,
      ownerUserId: userId,
      plan: 'starter',
      status: 'active',
    }).returning();

    return org;
  }

  /**
   * Get all accounts for an organization
   */
  async getAccountsByOrganization(organizationId: number): Promise<Account[]> {
    return db.select().from(accounts).where(eq(accounts.organizationId, organizationId));
  }

  /**
   * Get all accounts for a user (via their organization)
   */
  async getAccountsForUser(userId: number): Promise<{
    accounts: any[];
    overview: {
      totalAccounts: number;
      totalPhoneNumbers: number;
      totalMonthlySpend: number;
    };
  }> {
    // Check if user exists first
    const userExists = await db.select().from(users).where(eq(users.id, userId));
    if (userExists.length === 0) {
      // Return empty result if user doesn't exist
      return {
        accounts: [],
        overview: {
          totalAccounts: 0,
          totalPhoneNumbers: 0,
          totalMonthlySpend: 0,
        },
      };
    }

    // Get or create organization
    const org = await this.getOrCreateOrganization(userId);
    
    // Get all accounts
    const allAccounts = await db.select().from(accounts).where(eq(accounts.organizationId, org.id));
    
    // Get provider info for each account
    const providerList = await this.getProviders();
    const providerMap = new Map(providerList.map(p => [p.id, p]));

    // Build hierarchical structure
    const masterAccounts = allAccounts.filter(a => a.type === 'master');
    const subAccounts = allAccounts.filter(a => a.type === 'subaccount');

    const accountsWithChildren = masterAccounts.map(master => {
      const provider = providerMap.get(master.providerId);
      const children = subAccounts
        .filter(sub => sub.parentAccountId === master.id)
        .map(sub => ({
          id: `acc_${sub.id}`,
          parentId: `acc_${master.id}`,
          organizationId: `org_${org.id}`,
          provider: provider?.code || 'unknown',
          type: sub.type,
          name: sub.name,
          friendlyName: sub.friendlyName,
          status: sub.status,
          accountSid: sub.accountSid ? `${sub.accountSid.substring(0, 10)}...` : null,
          phoneNumberCount: sub.phoneNumberCount || 0,
          monthlySpend: sub.monthlySpend || 0,
          createdAt: sub.createdAt.toISOString(),
        }));

      return {
        id: `acc_${master.id}`,
        parentId: null,
        organizationId: `org_${org.id}`,
        provider: provider?.code || 'unknown',
        type: master.type,
        name: master.name,
        friendlyName: master.friendlyName,
        status: master.status,
        accountSid: master.accountSid ? `${master.accountSid.substring(0, 10)}...` : null,
        phoneNumberCount: master.phoneNumberCount || 0,
        monthlySpend: master.monthlySpend || 0,
        createdAt: master.createdAt.toISOString(),
        children,
      };
    });

    // Calculate totals
    const totalAccounts = allAccounts.length;
    const totalPhoneNumbers = allAccounts.reduce((sum, a) => sum + (a.phoneNumberCount || 0), 0);
    const totalMonthlySpend = allAccounts.reduce((sum, a) => sum + (a.monthlySpend || 0), 0);

    return {
      accounts: accountsWithChildren,
      overview: {
        totalAccounts,
        totalPhoneNumbers,
        totalMonthlySpend,
      },
    };
  }

  /**
   * Create a new account (master or sub)
   */
  async createAccount(data: {
    userId: number;
    providerCode: string;
    name: string;
    type: 'master' | 'subaccount';
    parentAccountId?: number;
    accountSid: string;
    authToken: string;
    apiKey?: string;
    apiSecret?: string;
  }): Promise<Account> {
    // Get organization
    const org = await this.getOrCreateOrganization(data.userId);
    
    // Get provider
    const provider = await this.getProviderByCode(data.providerCode);
    if (!provider) {
      throw new Error(`Provider '${data.providerCode}' not found`);
    }

    // Validate credentials by testing connection
    const isValid = await this.validateProviderCredentials(data.providerCode, data.accountSid, data.authToken);
    if (!isValid) {
      throw new Error('Invalid credentials. Please check your Account SID and Auth Token.');
    }

    // Create account
    const [account] = await db.insert(accounts).values({
      organizationId: org.id,
      parentAccountId: data.parentAccountId || null,
      providerId: provider.id,
      name: data.name,
      type: data.type,
      status: 'active',
      accountSid: data.accountSid,
      authToken: data.authToken, // TODO: Encrypt in production
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
    }).returning();

    // Sync account data from provider
    await this.syncAccountData(account.id);

    // Add user as owner
    await db.insert(accountUsers).values({
      accountId: account.id,
      userId: data.userId,
      role: 'owner',
    });

    return account;
  }

  /**
   * Validate provider credentials using the provider factory
   */
  async validateProviderCredentials(
    providerCode: string, 
    accountSid: string, 
    authToken: string,
    apiKey?: string,
    apiSecret?: string
  ): Promise<boolean> {
    try {
      return await providerFactory.validateCredentials(
        providerCode as ProviderCode,
        { accountSid, authToken, apiKey, apiSecret }
      );
    } catch (error) {
      console.error('Credential validation failed:', error);
      return false;
    }
  }

  /**
   * Get provider instance for an account
   */
  async getProviderForAccount(accountId: number): Promise<ICommunicationProvider | null> {
    const account = await this.getAccountById(accountId);
    if (!account || !account.accountSid || !account.authToken) {
      return null;
    }

    const provider = await db.select().from(providers).where(eq(providers.id, account.providerId));
    if (!provider[0]) return null;

    return providerFactory.create({
      code: provider[0].code as ProviderCode,
      credentials: {
        accountSid: account.accountSid,
        authToken: account.authToken,
        apiKey: account.apiKey || undefined,
        apiSecret: account.apiSecret || undefined,
      },
      accountId,
    });
  }

  /**
   * Sync account data from provider (phone numbers, metrics)
   * Uses the provider abstraction layer for all providers
   */
  async syncAccountData(accountId: number): Promise<void> {
    try {
      // Get provider instance
      const providerInstance = await this.getProviderForAccount(accountId);
      if (!providerInstance) {
        console.log(`No provider found for account ${accountId}`);
        return;
      }

      // Get analytics from provider (works for Twilio, Commio, Bandwidth)
      const analytics = await providerInstance.getAnalytics();
      
      // Update account metrics
      await db.update(accounts)
        .set({
          phoneNumberCount: analytics.phoneNumbers.length,
          monthlySpend: analytics.metrics.totalSpendThisMonth,
          friendlyName: analytics.account.friendlyName,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      // Sync phone numbers
      for (const pn of analytics.phoneNumbers) {
        const existing = await db.select()
          .from(accountPhoneNumbers)
          .where(and(
            eq(accountPhoneNumbers.accountId, accountId),
            eq(accountPhoneNumbers.phoneNumber, pn.phoneNumber)
          ));

        if (existing.length === 0) {
          await db.insert(accountPhoneNumbers).values({
            accountId,
            phoneNumber: pn.phoneNumber,
            friendlyName: pn.friendlyName,
            capabilities: pn.capabilities,
            providerSid: pn.sid,
            status: pn.status,
            monthlyCost: pn.monthlyCost,
          });
        } else {
          // Update existing
          await db.update(accountPhoneNumbers)
            .set({
              friendlyName: pn.friendlyName,
              capabilities: pn.capabilities,
              status: pn.status,
            })
            .where(eq(accountPhoneNumbers.id, existing[0].id));
        }
      }

      console.log(`Synced account ${accountId} (${providerInstance.name}): ${analytics.phoneNumbers.length} numbers, $${analytics.metrics.totalSpendThisMonth.toFixed(2)} spend`);
    } catch (error) {
      console.error(`Error syncing account ${accountId}:`, error);
    }
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId: number): Promise<Account | null> {
    const result = await db.select().from(accounts).where(eq(accounts.id, accountId));
    return result[0] || null;
  }

  /**
   * Get account with decrypted credentials (for API calls)
   */
  async getAccountCredentials(accountId: number): Promise<{
    accountSid?: string;
    authToken?: string;
    apiKey?: string;
    apiSecret?: string;
  } | null> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      return null;
    }

    // Return all available credentials - different providers use different fields
    return {
      accountSid: account.accountSid || undefined,
      authToken: account.authToken || undefined,
      apiKey: account.apiKey || undefined,
      apiSecret: account.apiSecret || undefined,
    };
  }

  /**
   * Update account
   */
  async updateAccount(accountId: number, data: Partial<InsertAccount>): Promise<Account | null> {
    const [updated] = await db.update(accounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(accounts.id, accountId))
      .returning();
    
    return updated || null;
  }

  /**
   * Delete account
   */
  async deleteAccount(accountId: number): Promise<boolean> {
    // Delete phone numbers first
    await db.delete(accountPhoneNumbers).where(eq(accountPhoneNumbers.accountId, accountId));
    
    // Delete account users
    await db.delete(accountUsers).where(eq(accountUsers.accountId, accountId));
    
    // Delete sub-accounts
    const subAccounts = await db.select().from(accounts).where(eq(accounts.parentAccountId, accountId));
    for (const sub of subAccounts) {
      await this.deleteAccount(sub.id);
    }
    
    // Delete account
    await db.delete(accounts).where(eq(accounts.id, accountId));
    
    return true;
  }

  /**
   * Migrate existing .env Twilio config to database
   */
  async migrateEnvConfig(userId: number): Promise<Account | null> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.log('No Twilio credentials in .env to migrate');
      return null;
    }

    // Check if already migrated
    const org = await this.getOrCreateOrganization(userId);
    const existing = await db.select()
      .from(accounts)
      .where(and(
        eq(accounts.organizationId, org.id),
        eq(accounts.accountSid, accountSid)
      ));

    if (existing.length > 0) {
      console.log('Twilio account already migrated');
      return existing[0];
    }

    // Create account from .env
    try {
      const account = await this.createAccount({
        userId,
        providerCode: 'twilio',
        name: 'Main Twilio Account',
        type: 'master',
        accountSid,
        authToken,
      });

      console.log('Successfully migrated Twilio account from .env');
      return account;
    } catch (error) {
      console.error('Failed to migrate Twilio account:', error);
      return null;
    }
  }
}

export const accountService = new AccountService();
