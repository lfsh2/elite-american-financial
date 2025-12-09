/**
 * Sub-Account Service
 * 
 * Manages Twilio sub-accounts for multi-tenant organization.
 * Sub-accounts provide isolated environments for different clients/projects.
 * 
 * Twilio Sub-Account Features:
 * - Separate SID and Auth Token
 * - Isolated phone numbers
 * - Separate usage and billing
 * - Can be suspended/closed independently
 */

import Twilio from 'twilio';
import { db } from '../db.js';
import { 
  accounts, 
  accountPhoneNumbers,
  providers,
  type Account,
  type InsertAccount 
} from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export interface SubAccountCreateOptions {
  friendlyName: string;
  parentAccountId: number;
  userId: number;
}

export interface SubAccountInfo {
  sid: string;
  friendlyName: string;
  authToken: string;
  status: string;
  dateCreated: string;
}

export interface PhoneNumberTransfer {
  phoneNumberSid: string;
  fromAccountSid: string;
  toAccountSid: string;
}

class SubAccountService {

  /**
   * Sync all existing sub-accounts from Twilio master account
   * This fetches sub-accounts that already exist in Twilio and imports them to DB
   */
  async syncExistingSubAccounts(masterAccountId: number): Promise<Account[]> {
    // Get master account credentials
    const [masterAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, masterAccountId));

    if (!masterAccount || !masterAccount.accountSid || !masterAccount.authToken) {
      throw new Error('Master account not found or missing credentials');
    }

    const client = Twilio(masterAccount.accountSid, masterAccount.authToken);
    const importedAccounts: Account[] = [];

    try {
      // Fetch all sub-accounts from Twilio
      const twilioSubAccounts = await client.api.accounts.list();
      
      console.log(`Found ${twilioSubAccounts.length} accounts in Twilio`);

      for (const twilioAccount of twilioSubAccounts) {
        // Skip the master account itself
        if (twilioAccount.sid === masterAccount.accountSid) {
          continue;
        }

        // Skip closed accounts
        if (twilioAccount.status === 'closed') {
          continue;
        }

        // Check if already exists in DB
        const existing = await db.select()
          .from(accounts)
          .where(eq(accounts.accountSid, twilioAccount.sid));

        if (existing.length > 0) {
          console.log(`Sub-account ${twilioAccount.sid} already exists, updating...`);
          // Update existing
          await db.update(accounts)
            .set({
              friendlyName: twilioAccount.friendlyName,
              status: twilioAccount.status,
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, existing[0].id));
          importedAccounts.push(existing[0]);
          continue;
        }

        // Create new sub-account in DB
        const [newAccount] = await db.insert(accounts).values({
          organizationId: masterAccount.organizationId,
          providerId: masterAccount.providerId,
          parentAccountId: masterAccountId,
          type: 'subaccount',
          name: twilioAccount.friendlyName,
          friendlyName: twilioAccount.friendlyName,
          accountSid: twilioAccount.sid,
          authToken: twilioAccount.authToken,
          status: twilioAccount.status,
        }).returning();

        console.log(`Imported sub-account: ${twilioAccount.sid} (${twilioAccount.friendlyName})`);
        importedAccounts.push(newAccount);

        // Sync phone numbers for this sub-account
        try {
          await this.syncSubAccount(newAccount.id);
        } catch (syncError) {
          console.error(`Error syncing sub-account ${newAccount.id}:`, syncError);
        }
      }

      return importedAccounts;
    } catch (error: any) {
      console.error('Error syncing sub-accounts from Twilio:', error);
      throw new Error(error.message || 'Failed to sync sub-accounts');
    }
  }

  /**
   * Sync sub-accounts from env-based Twilio account
   * Creates the master account in DB if needed, then syncs sub-accounts
   */
  async syncFromEnvAccount(userId: number): Promise<{ masterAccount: Account; subAccounts: Account[] }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured in environment');
    }

    const client = Twilio(accountSid, authToken);

    try {
      // Fetch master account info from Twilio
      const twilioMasterAccount = await client.api.accounts(accountSid).fetch();

      // Check if master account exists in DB
      let [masterAccount] = await db.select()
        .from(accounts)
        .where(eq(accounts.accountSid, accountSid));

      if (!masterAccount) {
        // Need to create organization and provider first
        const { accountService } = await import('./accountService');
        
        // Ensure we have a valid user - create one if needed
        const { users } = await import('../../shared/schema');
        const existingUsers = await db.select().from(users).where(eq(users.id, userId));
        let existingUser = existingUsers[0];
        
        if (!existingUser) {
          // Create a default admin user
          const newUsers = await db.insert(users).values({
            username: 'admin',
            password: 'admin123', // In production, this should be hashed
            email: 'admin@syncgrid.io',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            credits: 1000,
          }).returning() as any[];
          existingUser = newUsers[0];
          console.log(`Created default admin user: ${existingUser.id}`);
          userId = existingUser.id;
        }
        
        // Get or create organization for user
        const org = await accountService.getOrCreateOrganization(userId);
        
        // Get or create Twilio provider
        let [twilioProvider] = await db.select()
          .from(providers)
          .where(eq(providers.code, 'twilio'));

        if (!twilioProvider) {
          // Create Twilio provider
          [twilioProvider] = await db.insert(providers).values({
            code: 'twilio',
            name: 'Twilio',
            isActive: true,
          }).returning();
          console.log(`Created Twilio provider: ${twilioProvider.id}`);
        }

        // Create master account in DB
        [masterAccount] = await db.insert(accounts).values({
          organizationId: org.id,
          providerId: twilioProvider.id,
          parentAccountId: null,
          type: 'master',
          name: twilioMasterAccount.friendlyName || 'Main Twilio Account',
          friendlyName: twilioMasterAccount.friendlyName,
          accountSid: accountSid,
          authToken: authToken,
          status: twilioMasterAccount.status,
        }).returning();

        console.log(`Created master account in DB: ${masterAccount.id}`);
      }

      // Now sync sub-accounts
      const subAccounts = await this.syncExistingSubAccounts(masterAccount.id);

      // Also sync the master account's phone numbers
      await this.syncSubAccount(masterAccount.id);

      return { masterAccount, subAccounts };
    } catch (error: any) {
      console.error('Error syncing from env account:', error);
      throw new Error(error.message || 'Failed to sync from environment account');
    }
  }
  
  /**
   * Create a new Twilio sub-account under a master account
   */
  async createSubAccount(options: SubAccountCreateOptions): Promise<Account | null> {
    const { friendlyName, parentAccountId, userId } = options;

    // Get parent account credentials
    const [parentAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, parentAccountId));

    if (!parentAccount || !parentAccount.accountSid || !parentAccount.authToken) {
      throw new Error('Parent account not found or missing credentials');
    }

    // Initialize Twilio client with parent account credentials
    const client = Twilio(parentAccount.accountSid, parentAccount.authToken);

    try {
      // Create sub-account in Twilio
      const twilioSubAccount = await client.api.accounts.create({
        friendlyName,
      });

      // Store sub-account in database
      const [newAccount] = await db.insert(accounts).values({
        organizationId: parentAccount.organizationId,
        providerId: parentAccount.providerId,
        parentAccountId: parentAccountId,
        type: 'subaccount',
        name: friendlyName,
        friendlyName: friendlyName,
        accountSid: twilioSubAccount.sid,
        authToken: twilioSubAccount.authToken,
        status: twilioSubAccount.status,
      }).returning();

      console.log(`Created sub-account: ${twilioSubAccount.sid} (${friendlyName})`);
      
      return newAccount;
    } catch (error: any) {
      console.error('Error creating sub-account:', error);
      throw new Error(error.message || 'Failed to create sub-account');
    }
  }

  /**
   * List all sub-accounts under a master account
   */
  async listSubAccounts(parentAccountId: number): Promise<Account[]> {
    const subAccounts = await db.select()
      .from(accounts)
      .where(eq(accounts.parentAccountId, parentAccountId));

    return subAccounts;
  }

  /**
   * Get sub-account details from Twilio
   */
  async getSubAccountDetails(accountId: number): Promise<SubAccountInfo | null> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.accountSid) {
      return null;
    }

    // Get parent account for API access
    if (!account.parentAccountId) {
      throw new Error('Not a sub-account');
    }

    const [parentAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, account.parentAccountId));

    if (!parentAccount || !parentAccount.accountSid || !parentAccount.authToken) {
      throw new Error('Parent account not found');
    }

    const client = Twilio(parentAccount.accountSid, parentAccount.authToken);

    try {
      const twilioAccount = await client.api.accounts(account.accountSid).fetch();
      
      return {
        sid: twilioAccount.sid,
        friendlyName: twilioAccount.friendlyName,
        authToken: twilioAccount.authToken,
        status: twilioAccount.status,
        dateCreated: twilioAccount.dateCreated.toISOString(),
      };
    } catch (error) {
      console.error('Error fetching sub-account details:', error);
      return null;
    }
  }

  /**
   * Update sub-account friendly name
   */
  async updateSubAccount(
    accountId: number, 
    updates: { friendlyName?: string; status?: string }
  ): Promise<Account | null> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.parentAccountId) {
      throw new Error('Sub-account not found');
    }

    // Get parent account for API access
    const [parentAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, account.parentAccountId));

    if (!parentAccount || !parentAccount.accountSid || !parentAccount.authToken) {
      throw new Error('Parent account not found');
    }

    const client = Twilio(parentAccount.accountSid, parentAccount.authToken);

    try {
      // Update in Twilio
      const updateParams: any = {};
      if (updates.friendlyName) updateParams.friendlyName = updates.friendlyName;
      if (updates.status) updateParams.status = updates.status;

      await client.api.accounts(account.accountSid!).update(updateParams);

      // Update in database
      const [updated] = await db.update(accounts)
        .set({
          ...updates,
          name: updates.friendlyName || account.name,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId))
        .returning();

      return updated;
    } catch (error: any) {
      console.error('Error updating sub-account:', error);
      throw new Error(error.message || 'Failed to update sub-account');
    }
  }

  /**
   * Suspend a sub-account
   */
  async suspendSubAccount(accountId: number): Promise<Account | null> {
    return this.updateSubAccount(accountId, { status: 'suspended' });
  }

  /**
   * Reactivate a suspended sub-account
   */
  async activateSubAccount(accountId: number): Promise<Account | null> {
    return this.updateSubAccount(accountId, { status: 'active' });
  }

  /**
   * Close a sub-account (permanent)
   */
  async closeSubAccount(accountId: number): Promise<boolean> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.parentAccountId) {
      throw new Error('Sub-account not found');
    }

    const [parentAccount] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, account.parentAccountId));

    if (!parentAccount || !parentAccount.accountSid || !parentAccount.authToken) {
      throw new Error('Parent account not found');
    }

    const client = Twilio(parentAccount.accountSid, parentAccount.authToken);

    try {
      // Close in Twilio
      await client.api.accounts(account.accountSid!).update({ status: 'closed' });

      // Update in database
      await db.update(accounts)
        .set({ status: 'closed', updatedAt: new Date() })
        .where(eq(accounts.id, accountId));

      return true;
    } catch (error: any) {
      console.error('Error closing sub-account:', error);
      throw new Error(error.message || 'Failed to close sub-account');
    }
  }

  /**
   * Purchase a phone number for a sub-account
   */
  async purchasePhoneNumber(
    accountId: number, 
    phoneNumber: string
  ): Promise<any> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.accountSid || !account.authToken) {
      throw new Error('Account not found or missing credentials');
    }

    // Use sub-account's own credentials
    const client = Twilio(account.accountSid, account.authToken);

    try {
      const purchased = await client.incomingPhoneNumbers.create({
        phoneNumber,
      });

      // Store in database
      await db.insert(accountPhoneNumbers).values({
        accountId,
        phoneNumber: purchased.phoneNumber,
        friendlyName: purchased.friendlyName,
        capabilities: {
          sms: purchased.capabilities?.sms || false,
          voice: purchased.capabilities?.voice || false,
          mms: purchased.capabilities?.mms || false,
        },
        providerSid: purchased.sid,
        status: 'active',
      });

      // Update phone count
      await db.update(accounts)
        .set({ 
          phoneNumberCount: (account.phoneNumberCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      return purchased;
    } catch (error: any) {
      console.error('Error purchasing phone number:', error);
      throw new Error(error.message || 'Failed to purchase phone number');
    }
  }

  /**
   * Transfer a phone number between accounts
   * Note: This requires the number to be released and re-purchased
   * Twilio doesn't support direct transfers between sub-accounts
   */
  async transferPhoneNumber(transfer: PhoneNumberTransfer): Promise<boolean> {
    // This is a complex operation that requires:
    // 1. Release the number from source account
    // 2. Immediately purchase it on target account
    // There's a risk the number could be taken by someone else
    
    console.warn('Phone number transfer is not directly supported by Twilio');
    console.warn('Consider using the Twilio Console for this operation');
    
    throw new Error('Phone number transfer requires manual intervention via Twilio Console');
  }

  /**
   * Get phone numbers for a sub-account
   */
  async getPhoneNumbers(accountId: number): Promise<any[]> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.accountSid || !account.authToken) {
      throw new Error('Account not found or missing credentials');
    }

    const client = Twilio(account.accountSid, account.authToken);

    try {
      const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
      
      return numbers.map(n => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        dateCreated: n.dateCreated.toISOString(),
      }));
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      return [];
    }
  }

  /**
   * Search available phone numbers for purchase
   */
  async searchAvailableNumbers(
    accountId: number,
    options: { areaCode?: string; contains?: string; country?: string }
  ): Promise<any[]> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account) {
      throw new Error('Account not found');
    }

    // Use parent account credentials if this is a sub-account
    let credentials: { sid: string; token: string };
    
    if (account.parentAccountId) {
      const [parent] = await db.select()
        .from(accounts)
        .where(eq(accounts.id, account.parentAccountId));
      
      if (!parent || !parent.accountSid || !parent.authToken) {
        throw new Error('Parent account not found');
      }
      credentials = { sid: parent.accountSid, token: parent.authToken };
    } else {
      if (!account.accountSid || !account.authToken) {
        throw new Error('Account missing credentials');
      }
      credentials = { sid: account.accountSid, token: account.authToken };
    }

    const client = Twilio(credentials.sid, credentials.token);
    const country = options.country || 'US';

    try {
      const searchParams: any = { limit: 20 };
      if (options.areaCode) searchParams.areaCode = options.areaCode;
      if (options.contains) searchParams.contains = options.contains;

      const available = await client.availablePhoneNumbers(country).local.list(searchParams);

      return available.map(n => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        capabilities: n.capabilities,
      }));
    } catch (error) {
      console.error('Error searching available numbers:', error);
      return [];
    }
  }

  /**
   * Sync sub-account data from Twilio
   */
  async syncSubAccount(accountId: number): Promise<void> {
    const [account] = await db.select()
      .from(accounts)
      .where(eq(accounts.id, accountId));

    if (!account || !account.accountSid || !account.authToken) {
      throw new Error('Account not found or missing credentials');
    }

    const client = Twilio(account.accountSid, account.authToken);

    try {
      // Get phone numbers
      const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
      
      // Get usage for this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const usage = await client.usage.records.list({
        startDate: startOfMonth,
        endDate: now,
      });

      const totalSpend = usage.reduce((sum, u) => sum + parseFloat(String(u.price) || '0'), 0);

      // Update account
      await db.update(accounts)
        .set({
          phoneNumberCount: numbers.length,
          monthlySpend: totalSpend,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

      // Sync phone numbers
      for (const pn of numbers) {
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
            capabilities: {
              sms: pn.capabilities?.sms || false,
              voice: pn.capabilities?.voice || false,
              mms: pn.capabilities?.mms || false,
            },
            providerSid: pn.sid,
            status: 'active',
          });
        }
      }

      console.log(`Synced sub-account ${accountId}: ${numbers.length} numbers, $${totalSpend.toFixed(2)} spend`);
    } catch (error) {
      console.error(`Error syncing sub-account ${accountId}:`, error);
    }
  }
}

export const subAccountService = new SubAccountService();
