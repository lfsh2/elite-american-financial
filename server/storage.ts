import {
  users, type User, type InsertUser,
  smsMessages, type SmsMessage, type InsertSmsMessage,
  voiceCalls, type VoiceCall, type InsertVoiceCall,
  emailMessages, type EmailMessage, type InsertEmailMessage,
  campaigns, type Campaign, type InsertCampaign,
  contacts, type Contact, type InsertContact,
  billingTransactions, type BillingTransaction, type InsertBillingTransaction,
  apiKeys, type ApiKey, type InsertApiKey, generateApiKey,
  webhooks, type Webhook, type InsertWebhook
} from "@shared/schema";
import { db } from "./db.js";
import { eq } from "drizzle-orm";

// A2P Registration types
interface A2PCompanyRegistration {
  id: string;
  userId: number;
  companyName: string;
  externalId?: string;
  status: string;
  dateCreated: string;
  dateUpdated: string;
}

interface A2PCampaignRegistration {
  id: string;
  userId: number;
  companyRegistrationId: string;
  campaignName: string;
  useCase: string;
  externalId?: string;
  status: string;
  dateCreated: string;
  dateUpdated: string;
}

// Apple Business Chat Registration type
interface AppleBusinessRegistration {
  id: string;
  userId: number;
  businessId: string;
  brandName: string;
  status: string;
  dateCreated: string;
  dateUpdated: string;
}

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getSubAccounts(userId: number): Promise<User[]>;
  
  // Debug methods - not for production use
  getUsersForDebug(): Map<number, User>;
  
  // SMS messages
  createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage>;
  getSmsMessages(userId: number, limit?: number): Promise<SmsMessage[]>;
  getSmsConversation(userId: number, contact: string): Promise<SmsMessage[]>;
  
  // Voice calls
  createVoiceCall(call: InsertVoiceCall): Promise<VoiceCall>;
  updateVoiceCall(id: number, updates: Partial<VoiceCall>): Promise<VoiceCall | undefined>;
  getVoiceCalls(userId: number, limit?: number): Promise<VoiceCall[]>;
  
  // Email messages
  createEmailMessage(email: InsertEmailMessage): Promise<EmailMessage>;
  getEmailMessages(userId: number, limit?: number): Promise<EmailMessage[]>;
  
  // Campaigns
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaigns(userId: number): Promise<Campaign[]>;
  updateCampaign(id: number, updates: Partial<Campaign>): Promise<Campaign | undefined>;
  
  // Contacts
  createContact(contact: InsertContact): Promise<Contact>;
  getContacts(userId: number): Promise<Contact[]>;
  
  // Billing
  createBillingTransaction(transaction: InsertBillingTransaction): Promise<BillingTransaction>;
  
  // A2P Compliance
  saveA2PCompanyRegistration(registration: A2PCompanyRegistration): Promise<void>;
  getA2PCompanyRegistration(userId: number): Promise<A2PCompanyRegistration | undefined>;
  updateA2PCompanyRegistrationStatus(id: string, status: string): Promise<void>;
  
  saveA2PCampaignRegistration(registration: A2PCampaignRegistration): Promise<void>;
  getA2PCampaignRegistrations(companyRegistrationId: string): Promise<A2PCampaignRegistration[]>;
  updateA2PCampaignRegistrationStatus(id: string, status: string): Promise<void>;
  getBillingTransactions(userId: number): Promise<BillingTransaction[]>;
  
  // Apple Business Chat
  saveAppleBusinessRegistration(registration: AppleBusinessRegistration): Promise<void>;
  getAppleBusinessRegistration(id: string): Promise<AppleBusinessRegistration | undefined>;
  getAppleBusinessRegistrationByUserId(userId: number): Promise<AppleBusinessRegistration | undefined>;
  updateAppleBusinessRegistrationStatus(id: string, status: string): Promise<void>;
  
  // API Keys for CRM & external integration
  createApiKey(apiKeyData: InsertApiKey): Promise<ApiKey>;
  getApiKey(id: number): Promise<ApiKey | undefined>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  getApiKeys(userId: number): Promise<ApiKey[]>;
  updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: number): Promise<boolean>;
  
  // Webhooks for event notifications
  createWebhook(webhookData: InsertWebhook): Promise<Webhook>;
  getWebhook(id: number): Promise<Webhook | undefined>;
  getWebhooks(userId: number): Promise<Webhook[]>;
  updateWebhook(id: number, updates: Partial<Webhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: number): Promise<boolean>;
  updateWebhookFailCount(id: number, failCount: number, lastResponse?: any): Promise<boolean>;
  
  // User Phone Assignments
  getUserPhoneAssignments(userId: number): Promise<UserPhoneAssignmentWithDetails[]>;
  assignPhoneToUser(assignment: InsertUserPhoneAssignment): Promise<UserPhoneAssignment>;
  removePhoneAssignment(assignmentId: number, userId: number): Promise<boolean>;
  getAvailablePhoneNumbers(): Promise<AccountPhoneNumberWithAccount[]>;
}

// Types for phone assignments
interface UserPhoneAssignment {
  id: number;
  userId: number;
  phoneNumberId: number;
  isPrimary: boolean | null;
  canSend: boolean | null;
  canReceive: boolean | null;
  assignedAt: Date;
  assignedBy: number | null;
}

interface InsertUserPhoneAssignment {
  userId: number;
  phoneNumberId: number;
  isPrimary?: boolean;
  canSend?: boolean;
  canReceive?: boolean;
  assignedBy?: number;
}

interface UserPhoneAssignmentWithDetails extends UserPhoneAssignment {
  phoneNumber?: string;
  friendlyName?: string;
  accountName?: string;
}

interface AccountPhoneNumberWithAccount {
  id: number;
  phoneNumber: string;
  friendlyName: string | null;
  accountId: number;
  accountName?: string;
  isAssigned?: boolean;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private smsMessages: Map<number, SmsMessage>;
  private voiceCalls: Map<number, VoiceCall>;
  private emailMessages: Map<number, EmailMessage>;
  private campaigns: Map<number, Campaign>;
  private contacts: Map<number, Contact>;
  private billingTransactions: Map<number, BillingTransaction>;
  private apiKeys: Map<number, ApiKey>;
  private webhooks: Map<number, Webhook>;
  
  // A2P Registration storage
  private a2pCompanyRegistrations: Map<string, A2PCompanyRegistration>;
  private a2pCampaignRegistrations: Map<string, A2PCampaignRegistration>;
  private appleBusinessRegistrations: Map<string, AppleBusinessRegistration>;
  
  private userIdCounter: number;
  private smsIdCounter: number;
  private voiceIdCounter: number;
  private emailIdCounter: number;
  private campaignIdCounter: number;
  private contactIdCounter: number;
  private billingIdCounter: number;
  private apiKeyIdCounter: number;
  private webhookIdCounter: number;

  constructor() {
    this.users = new Map();
    this.smsMessages = new Map();
    this.voiceCalls = new Map();
    this.emailMessages = new Map();
    this.campaigns = new Map();
    this.contacts = new Map();
    this.billingTransactions = new Map();
    this.apiKeys = new Map();
    this.webhooks = new Map();
    
    // Initialize A2P registration maps
    this.a2pCompanyRegistrations = new Map();
    this.a2pCampaignRegistrations = new Map();
    this.appleBusinessRegistrations = new Map();
    
    this.userIdCounter = 1;
    this.smsIdCounter = 1;
    this.voiceIdCounter = 1;
    this.emailIdCounter = 1;
    this.campaignIdCounter = 1;
    this.contactIdCounter = 1;
    this.billingIdCounter = 1;
    this.apiKeyIdCounter = 1;
    this.webhookIdCounter = 1;
    
    // Initialize default admin user in database (async, runs in background)
    this.initializeDefaultAdmin();
  }
  
  private async initializeDefaultAdmin(): Promise<void> {
    try {
      // Check if admin user exists in database
      const existingAdmin = await this.getUserByUsername("admin");
      if (!existingAdmin) {
        console.log('[Storage] Creating default admin user in database...');
        await this.createUser({
          username: "admin",
          password: "admin123", // In real app, would be hashed
          firstName: "Admin",
          lastName: "User",
          email: "admin@textflow.ai",
          role: "super_admin"
        });
        console.log('[Storage] Default admin user created');
      } else {
        console.log('[Storage] Admin user already exists in database');
      }
    } catch (error) {
      console.error('[Storage] Error initializing admin user:', error);
    }
  }

  // User Management - Using Database for Persistence
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error('[Storage] Error getting user from database:', error);
      return this.users.get(id);
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const { ilike } = await import('drizzle-orm');
      const [user] = await db.select().from(users).where(ilike(users.username, username));
      return user;
    } catch (error) {
      console.error('[Storage] Error getting user by username:', error);
      return Array.from(this.users.values()).find(
        (user) => user.username.toLowerCase() === username.toLowerCase()
      );
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const { ilike } = await import('drizzle-orm');
      const [user] = await db.select().from(users).where(ilike(users.email, email));
      return user;
    } catch (error) {
      console.error('[Storage] Error getting user by email:', error);
      return Array.from(this.users.values()).find(
        (user) => user.email.toLowerCase() === email.toLowerCase()
      );
    }
  }

  async createUser(userData: InsertUser): Promise<User> {
    try {
      console.log('[Storage] Creating user in database:', userData.username);
      const [newUser] = await db.insert(users).values({
        username: userData.username,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role || 'user',
        status: (userData as any).status || 'active',
        credits: 100,
        parentId: userData.parentId || null,
        isSubAccount: !!userData.parentId,
      }).returning();
      
      console.log('[Storage] User created successfully in database with ID:', newUser.id);
      return newUser;
    } catch (error) {
      console.error('[Storage] ERROR creating user in database:', error);
      console.error('[Storage] FALLING BACK TO IN-MEMORY - USER WILL NOT PERSIST!');
      // Fallback to in-memory
      const id = this.userIdCounter++;
      const now = new Date();
      
      const user: User = {
        id,
        username: userData.username,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role || 'user',
        status: (userData as any).status || 'active',
        credits: 100,
        parentId: userData.parentId || null,
        isSubAccount: !!userData.parentId,
        assignedPhoneNumberId: null,
        autoRefillEnabled: false,
        autoRefillThreshold: 100,
        autoRefillAmount: 1000,
        createdAt: now,
        lastLoginAt: null,
      };
      
      this.users.set(id, user);
      return user;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    try {
      const [updatedUser] = await db.update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      return updatedUser;
    } catch (error) {
      console.error('[Storage] Error updating user in database:', error);
      const user = await this.getUser(id);
      if (!user) return undefined;
      
      const updatedUser = { ...user, ...updates };
      this.users.set(id, updatedUser);
      return updatedUser;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const allUsers = await db.select().from(users);
      return allUsers;
    } catch (error) {
      console.error('[Storage] Error getting all users from database:', error);
      return Array.from(this.users.values());
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      console.log(`[Storage] Attempting to delete user ${id}`);
      
      // First check if user exists
      const [existingUser] = await db.select().from(users).where(eq(users.id, id));
      console.log(`[Storage] User ${id} exists:`, !!existingUser);
      
      if (!existingUser) {
        console.log(`[Storage] User ${id} not found in database`);
        return false;
      }
      
      // Delete user's phone assignments first
      const { userPhoneAssignments } = await import('../shared/schema.js');
      await db.delete(userPhoneAssignments).where(eq(userPhoneAssignments.userId, id));
      console.log(`[Storage] Deleted phone assignments for user ${id}`);
      
      // Delete the user
      await db.delete(users).where(eq(users.id, id));
      console.log(`[Storage] Successfully deleted user ${id}`);
      return true;
    } catch (error) {
      console.error('[Storage] Error deleting user from database:', error);
      return this.users.delete(id);
    }
  }

  async getSubAccounts(userId: number): Promise<User[]> {
    try {
      const subAccounts = await db.select().from(users).where(eq(users.parentId, userId));
      return subAccounts;
    } catch (error) {
      console.error('[Storage] Error getting sub-accounts from database:', error);
      return Array.from(this.users.values()).filter(
        (user) => user.parentId === userId
      );
    }
  }
  
  // Debug method - not for production use
  getUsersForDebug(): Map<number, User> {
    return this.users;
  }

  // SMS Messages
  async createSmsMessage(message: InsertSmsMessage): Promise<SmsMessage> {
    const id = this.smsIdCounter++;
    const now = new Date();
    
    const smsMessage: SmsMessage = {
      id,
      ...message,
      sentAt: now,
      mediaUrls: message.mediaUrls || [],
    };
    
    this.smsMessages.set(id, smsMessage);
    return smsMessage;
  }

  async getSmsMessages(userId: number, limit = 50): Promise<SmsMessage[]> {
    return Array.from(this.smsMessages.values())
      .filter(msg => msg.userId === userId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, limit);
  }

  async getSmsConversation(userId: number, contact: string): Promise<SmsMessage[]> {
    return Array.from(this.smsMessages.values())
      .filter(msg => msg.userId === userId && (msg.to === contact || msg.from === contact))
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }

  // Voice Calls
  async createVoiceCall(call: InsertVoiceCall): Promise<VoiceCall> {
    const id = this.voiceIdCounter++;
    const now = new Date();
    
    const voiceCall: VoiceCall = {
      id,
      ...call,
      startTime: now,
      endTime: undefined,
      duration: undefined,
      recordingUrl: undefined,
    };
    
    this.voiceCalls.set(id, voiceCall);
    return voiceCall;
  }

  async updateVoiceCall(id: number, updates: Partial<VoiceCall>): Promise<VoiceCall | undefined> {
    const call = this.voiceCalls.get(id);
    if (!call) return undefined;
    
    const updatedCall = { ...call, ...updates };
    this.voiceCalls.set(id, updatedCall);
    return updatedCall;
  }

  async getVoiceCalls(userId: number, limit = 50): Promise<VoiceCall[]> {
    return Array.from(this.voiceCalls.values())
      .filter(call => call.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  // Email Messages
  async createEmailMessage(email: InsertEmailMessage): Promise<EmailMessage> {
    const id = this.emailIdCounter++;
    const now = new Date();
    
    const emailMessage: EmailMessage = {
      id,
      ...email,
      sentAt: now,
    };
    
    this.emailMessages.set(id, emailMessage);
    return emailMessage;
  }

  async getEmailMessages(userId: number, limit = 50): Promise<EmailMessage[]> {
    return Array.from(this.emailMessages.values())
      .filter(email => email.userId === userId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, limit);
  }

  // Campaigns
  async createCampaign(campaignData: InsertCampaign): Promise<Campaign> {
    const id = this.campaignIdCounter++;
    const now = new Date();
    
    const campaign: Campaign = {
      id,
      ...campaignData,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      createdAt: now,
    };
    
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async getCampaigns(userId: number): Promise<Campaign[]> {
    return Array.from(this.campaigns.values())
      .filter(campaign => campaign.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateCampaign(id: number, updates: Partial<Campaign>): Promise<Campaign | undefined> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return undefined;
    
    const updatedCampaign = { ...campaign, ...updates };
    this.campaigns.set(id, updatedCampaign);
    return updatedCampaign;
  }

  // Contacts
  async createContact(contactData: InsertContact): Promise<Contact> {
    const id = this.contactIdCounter++;
    const now = new Date();
    
    const contact: Contact = {
      id,
      ...contactData,
      tags: contactData.tags || [],
      createdAt: now,
    };
    
    this.contacts.set(id, contact);
    return contact;
  }

  async getContacts(userId: number): Promise<Contact[]> {
    return Array.from(this.contacts.values())
      .filter(contact => contact.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Billing
  async createBillingTransaction(transactionData: InsertBillingTransaction): Promise<BillingTransaction> {
    const id = this.billingIdCounter++;
    const now = new Date();
    
    const transaction: BillingTransaction = {
      id,
      ...transactionData,
      createdAt: now,
    };
    
    this.billingTransactions.set(id, transaction);
    
    // Update user credits
    if (transaction.type === 'credit-purchase' && transaction.credits) {
      const user = await this.getUser(transaction.userId);
      if (user) {
        await this.updateUser(user.id, { 
          credits: user.credits + transaction.credits 
        });
      }
    } else if (transaction.type === 'credit-usage' && transaction.credits) {
      const user = await this.getUser(transaction.userId);
      if (user) {
        await this.updateUser(user.id, { 
          credits: Math.max(0, user.credits - transaction.credits) 
        });
      }
    }
    
    return transaction;
  }

  async getBillingTransactions(userId: number): Promise<BillingTransaction[]> {
    return Array.from(this.billingTransactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  // API Keys
  async createApiKey(apiKeyData: InsertApiKey): Promise<ApiKey> {
    const id = this.apiKeyIdCounter++;
    const now = new Date();
    
    // Generate key and secret
    const { key, secret } = generateApiKey();
    
    const apiKey: ApiKey = {
      id,
      ...apiKeyData,
      key,
      secret,
      createdAt: now,
      lastUsed: null,
      expiresAt: apiKeyData.expiresAt || null,
      active: true,
      permissions: apiKeyData.permissions || [],
      ipRestrictions: apiKeyData.ipRestrictions || null,
      usageLimit: apiKeyData.usageLimit || null,
      usageCount: 0
    };
    
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }
  
  async getApiKey(id: number): Promise<ApiKey | undefined> {
    return this.apiKeys.get(id);
  }
  
  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find(
      apiKey => apiKey.key === key && apiKey.active
    );
  }
  
  async getApiKeys(userId: number): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values())
      .filter(apiKey => apiKey.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const apiKey = await this.getApiKey(id);
    if (!apiKey) return undefined;
    
    const updatedApiKey = { ...apiKey, ...updates };
    this.apiKeys.set(id, updatedApiKey);
    return updatedApiKey;
  }
  
  async deleteApiKey(id: number): Promise<boolean> {
    const apiKey = await this.getApiKey(id);
    if (!apiKey) return false;
    
    // Soft delete by making inactive
    await this.updateApiKey(id, { active: false });
    return true;
  }
  
  // Webhooks
  async createWebhook(webhookData: InsertWebhook): Promise<Webhook> {
    const id = this.webhookIdCounter++;
    const now = new Date();
    
    const webhook: Webhook = {
      id,
      ...webhookData,
      createdAt: now,
      active: true,
      failCount: 0,
      lastResponse: null,
      events: webhookData.events || [],
      retryEnabled: webhookData.retryEnabled ?? true,
      retryCount: webhookData.retryCount ?? 3,
      retryInterval: webhookData.retryInterval ?? 60,
      lastSuccessAt: null,
      lastFailureAt: null,
      deliveryLogs: null
    };
    
    this.webhooks.set(id, webhook);
    return webhook;
  }
  
  async getWebhook(id: number): Promise<Webhook | undefined> {
    return this.webhooks.get(id);
  }
  
  async getWebhooks(userId: number): Promise<Webhook[]> {
    return Array.from(this.webhooks.values())
      .filter(webhook => webhook.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async updateWebhook(id: number, updates: Partial<Webhook>): Promise<Webhook | undefined> {
    const webhook = await this.getWebhook(id);
    if (!webhook) return undefined;
    
    const updatedWebhook = { ...webhook, ...updates };
    this.webhooks.set(id, updatedWebhook);
    return updatedWebhook;
  }
  
  async deleteWebhook(id: number): Promise<boolean> {
    const webhook = await this.getWebhook(id);
    if (!webhook) return false;
    
    // Soft delete by setting inactive
    await this.updateWebhook(id, { active: false });
    return true;
  }
  
  async updateWebhookFailCount(id: number, failCount: number, lastResponse?: any): Promise<boolean> {
    const webhook = await this.getWebhook(id);
    if (!webhook) return false;
    
    await this.updateWebhook(id, { 
      failCount,
      lastResponse: lastResponse || webhook.lastResponse 
    });
    
    return true;
  }

  // A2P Company Registration
  async saveA2PCompanyRegistration(registration: A2PCompanyRegistration): Promise<void> {
    this.a2pCompanyRegistrations.set(registration.id, registration);
  }
  
  async getA2PCompanyRegistration(userId: number): Promise<A2PCompanyRegistration | undefined> {
    return Array.from(this.a2pCompanyRegistrations.values()).find(
      reg => reg.userId === userId
    );
  }
  
  async updateA2PCompanyRegistrationStatus(id: string, status: string): Promise<void> {
    const registration = this.a2pCompanyRegistrations.get(id);
    if (registration) {
      registration.status = status;
      registration.dateUpdated = new Date().toISOString();
      this.a2pCompanyRegistrations.set(id, registration);
    }
  }
  
  // A2P Campaign Registration
  async saveA2PCampaignRegistration(registration: A2PCampaignRegistration): Promise<void> {
    this.a2pCampaignRegistrations.set(registration.id, registration);
  }
  
  async getA2PCampaignRegistrations(companyRegistrationId: string): Promise<A2PCampaignRegistration[]> {
    return Array.from(this.a2pCampaignRegistrations.values()).filter(
      reg => reg.companyRegistrationId === companyRegistrationId
    );
  }
  
  async updateA2PCampaignRegistrationStatus(id: string, status: string): Promise<void> {
    const registration = this.a2pCampaignRegistrations.get(id);
    if (registration) {
      registration.status = status;
      registration.dateUpdated = new Date().toISOString();
      this.a2pCampaignRegistrations.set(id, registration);
    }
  }

  // Apple Business Chat Registration
  async saveAppleBusinessRegistration(registration: AppleBusinessRegistration): Promise<void> {
    this.appleBusinessRegistrations.set(registration.id, registration);
  }
  
  async getAppleBusinessRegistration(id: string): Promise<AppleBusinessRegistration | undefined> {
    return this.appleBusinessRegistrations.get(id);
  }
  
  async getAppleBusinessRegistrationByUserId(userId: number): Promise<AppleBusinessRegistration | undefined> {
    return Array.from(this.appleBusinessRegistrations.values()).find(
      reg => reg.userId === userId
    );
  }
  
  async updateAppleBusinessRegistrationStatus(id: string, status: string): Promise<void> {
    const registration = this.appleBusinessRegistrations.get(id);
    if (registration) {
      registration.status = status;
      registration.dateUpdated = new Date().toISOString();
      this.appleBusinessRegistrations.set(id, registration);
    }
  }

  // ============================================
  // USER PHONE ASSIGNMENTS
  // ============================================
  
  private userPhoneAssignments: Map<number, UserPhoneAssignment> = new Map();
  private phoneAssignmentIdCounter: number = 1;
  
  // Mock phone numbers for testing (in production, these come from accountPhoneNumbers table)
  private mockPhoneNumbers: AccountPhoneNumberWithAccount[] = [
    { id: 1, phoneNumber: '+18005551234', friendlyName: 'Main Line', accountId: 1, accountName: 'NMWR LLC', isAssigned: false },
    { id: 2, phoneNumber: '+18005555678', friendlyName: 'Support Line', accountId: 1, accountName: 'NMWR LLC', isAssigned: false },
    { id: 3, phoneNumber: '+18005559012', friendlyName: 'Sales Line', accountId: 2, accountName: 'Software Integration', isAssigned: false },
  ];

  async getUserPhoneAssignments(userId: number): Promise<UserPhoneAssignmentWithDetails[]> {
    const assignments = Array.from(this.userPhoneAssignments.values())
      .filter(a => a.userId === userId);
    
    // Enrich with phone number details
    return assignments.map(assignment => {
      const phoneNumber = this.mockPhoneNumbers.find(p => p.id === assignment.phoneNumberId);
      return {
        ...assignment,
        phoneNumber: phoneNumber?.phoneNumber,
        friendlyName: phoneNumber?.friendlyName || undefined,
        accountName: phoneNumber?.accountName,
      };
    });
  }

  async assignPhoneToUser(assignment: InsertUserPhoneAssignment): Promise<UserPhoneAssignment> {
    const id = this.phoneAssignmentIdCounter++;
    
    // If this is marked as primary, unset other primaries for this user
    if (assignment.isPrimary) {
      const entries = Array.from(this.userPhoneAssignments.entries());
      for (let i = 0; i < entries.length; i++) {
        const [key, existing] = entries[i];
        if (existing.userId === assignment.userId && existing.isPrimary) {
          existing.isPrimary = false;
          this.userPhoneAssignments.set(key, existing);
        }
      }
    }
    
    const newAssignment: UserPhoneAssignment = {
      id,
      userId: assignment.userId,
      phoneNumberId: assignment.phoneNumberId,
      isPrimary: assignment.isPrimary ?? false,
      canSend: assignment.canSend ?? true,
      canReceive: assignment.canReceive ?? true,
      assignedAt: new Date(),
      assignedBy: assignment.assignedBy ?? null,
    };
    
    this.userPhoneAssignments.set(id, newAssignment);
    
    // Mark phone as assigned
    const phoneIdx = this.mockPhoneNumbers.findIndex(p => p.id === assignment.phoneNumberId);
    if (phoneIdx >= 0) {
      this.mockPhoneNumbers[phoneIdx].isAssigned = true;
    }
    
    return newAssignment;
  }

  async removePhoneAssignment(assignmentId: number, userId: number): Promise<boolean> {
    const assignment = this.userPhoneAssignments.get(assignmentId);
    if (!assignment || assignment.userId !== userId) {
      return false;
    }
    
    // Mark phone as available again
    const phoneIdx = this.mockPhoneNumbers.findIndex(p => p.id === assignment.phoneNumberId);
    if (phoneIdx >= 0) {
      // Check if any other user has this phone assigned
      const otherAssignments = Array.from(this.userPhoneAssignments.values())
        .filter(a => a.phoneNumberId === assignment.phoneNumberId && a.id !== assignmentId);
      if (otherAssignments.length === 0) {
        this.mockPhoneNumbers[phoneIdx].isAssigned = false;
      }
    }
    
    this.userPhoneAssignments.delete(assignmentId);
    return true;
  }

  async getAvailablePhoneNumbers(): Promise<AccountPhoneNumberWithAccount[]> {
    // Return all phone numbers with their assignment status
    return this.mockPhoneNumbers.map(phone => ({
      ...phone,
      isAssigned: Array.from(this.userPhoneAssignments.values())
        .some(a => a.phoneNumberId === phone.id),
    }));
  }

  // ============================================
  // USER PRICING & BILLING
  // ============================================
  
  private userPricingConfigs: Map<number, UserPricingConfigData> = new Map();
  private userUsageRecords: Map<number, UserUsageRecordData[]> = new Map();
  private userBillingSummaries: Map<number, UserBillingSummaryData[]> = new Map();
  private usageRecordIdCounter: number = 1;
  private billingSummaryIdCounter: number = 1;

  async getUserPricingConfig(userId: number): Promise<UserPricingConfigData | undefined> {
    return this.userPricingConfigs.get(userId);
  }

  async upsertUserPricingConfig(config: InsertUserPricingConfigData): Promise<UserPricingConfigData> {
    const existing = this.userPricingConfigs.get(config.userId);
    const now = new Date();
    
    if (existing) {
      const updated: UserPricingConfigData = {
        ...existing,
        ...config,
        updatedAt: now,
      };
      this.userPricingConfigs.set(config.userId, updated);
      return updated;
    }
    
    const newConfig: UserPricingConfigData = {
      id: config.userId, // Use userId as id for simplicity
      userId: config.userId,
      smsOutboundRate: config.smsOutboundRate || "0.015",
      smsInboundRate: config.smsInboundRate || "0.01",
      mmsOutboundRate: config.mmsOutboundRate || "0.05",
      mmsInboundRate: config.mmsInboundRate || "0.03",
      monthlyPhoneNumberFee: config.monthlyPhoneNumberFee || "0",
      billingCycleDay: config.billingCycleDay || 1,
      createdAt: now,
      updatedAt: now,
    };
    
    this.userPricingConfigs.set(config.userId, newConfig);
    return newConfig;
  }

  async getUserUsageRecords(userId: number, startDate?: Date, endDate?: Date): Promise<UserUsageRecordData[]> {
    const records = this.userUsageRecords.get(userId) || [];
    
    if (!startDate && !endDate) {
      return records;
    }
    
    return records.filter(record => {
      const recordDate = new Date(record.createdAt);
      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;
      return true;
    });
  }

  async createUsageRecord(record: InsertUserUsageRecordData): Promise<UserUsageRecordData> {
    const id = this.usageRecordIdCounter++;
    const newRecord: UserUsageRecordData = {
      id,
      userId: record.userId,
      phoneNumberId: record.phoneNumberId || null,
      messageType: record.messageType,
      direction: record.direction,
      segmentCount: record.segmentCount || 1,
      rateApplied: record.rateApplied,
      cost: record.cost,
      messageSid: record.messageSid || null,
      smsMessageId: record.smsMessageId || null,
      createdAt: new Date(),
    };
    
    const userRecords = this.userUsageRecords.get(record.userId) || [];
    userRecords.push(newRecord);
    this.userUsageRecords.set(record.userId, userRecords);
    
    return newRecord;
  }

  async getUserBillingSummaries(userId: number): Promise<UserBillingSummaryData[]> {
    return this.userBillingSummaries.get(userId) || [];
  }

  async createBillingSummary(summary: InsertUserBillingSummaryData): Promise<UserBillingSummaryData> {
    const id = this.billingSummaryIdCounter++;
    const newSummary: UserBillingSummaryData = {
      id,
      userId: summary.userId,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      totalSmsOutbound: summary.totalSmsOutbound || 0,
      totalSmsInbound: summary.totalSmsInbound || 0,
      totalMmsOutbound: summary.totalMmsOutbound || 0,
      totalMmsInbound: summary.totalMmsInbound || 0,
      smsCost: summary.smsCost || "0",
      mmsCost: summary.mmsCost || "0",
      phoneNumberFees: summary.phoneNumberFees || "0",
      totalCost: summary.totalCost || "0",
      status: summary.status || "pending",
      paidAt: null,
      createdAt: new Date(),
    };
    
    const userSummaries = this.userBillingSummaries.get(summary.userId) || [];
    userSummaries.push(newSummary);
    this.userBillingSummaries.set(summary.userId, userSummaries);
    
    return newSummary;
  }
}

// Types for pricing and billing
interface UserPricingConfigData {
  id: number;
  userId: number;
  smsOutboundRate: string;
  smsInboundRate: string;
  mmsOutboundRate: string;
  mmsInboundRate: string;
  monthlyPhoneNumberFee: string;
  billingCycleDay: number;
  createdAt: Date;
  updatedAt: Date;
}

interface InsertUserPricingConfigData {
  userId: number;
  smsOutboundRate?: string;
  smsInboundRate?: string;
  mmsOutboundRate?: string;
  mmsInboundRate?: string;
  monthlyPhoneNumberFee?: string;
  billingCycleDay?: number;
}

interface UserUsageRecordData {
  id: number;
  userId: number;
  phoneNumberId: number | null;
  messageType: string;
  direction: string;
  segmentCount: number;
  rateApplied: string;
  cost: string;
  messageSid: string | null;
  smsMessageId: number | null;
  createdAt: Date;
}

interface InsertUserUsageRecordData {
  userId: number;
  phoneNumberId?: number;
  messageType: string;
  direction: string;
  segmentCount?: number;
  rateApplied: string;
  cost: string;
  messageSid?: string;
  smsMessageId?: number;
}

interface UserBillingSummaryData {
  id: number;
  userId: number;
  periodStart: Date;
  periodEnd: Date;
  totalSmsOutbound: number;
  totalSmsInbound: number;
  totalMmsOutbound: number;
  totalMmsInbound: number;
  smsCost: string;
  mmsCost: string;
  phoneNumberFees: string;
  totalCost: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface InsertUserBillingSummaryData {
  userId: number;
  periodStart: Date;
  periodEnd: Date;
  totalSmsOutbound?: number;
  totalSmsInbound?: number;
  totalMmsOutbound?: number;
  totalMmsInbound?: number;
  smsCost?: string;
  mmsCost?: string;
  phoneNumberFees?: string;
  totalCost?: string;
  status?: string;
}

// Credit system types
interface UserCreditRatesData {
  id: number;
  userId: number;
  smsOutboundCredits: number;
  smsInboundCredits: number;
  mmsOutboundCredits: number;
  mmsInboundCredits: number;
  creditPurchaseRate: string;
  lowBalanceThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

interface InsertUserCreditRatesData {
  userId: number;
  smsOutboundCredits?: number;
  smsInboundCredits?: number;
  mmsOutboundCredits?: number;
  mmsInboundCredits?: number;
  creditPurchaseRate?: string;
  lowBalanceThreshold?: number;
}

interface CreditTransactionData {
  id: number;
  userId: number;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceType: string | null;
  referenceId: number | null;
  createdAt: Date;
}

interface CreditPackageData {
  id: number;
  name: string;
  credits: number;
  price: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export const storage = new MemStorage();

// Add credit management methods to MemStorage prototype
declare module './storage' {
  interface MemStorage {
    userCreditRates: Map<number, UserCreditRatesData>;
    creditTransactions: Map<number, CreditTransactionData[]>;
    creditPackages: CreditPackageData[];
    creditTransactionIdCounter: number;
    
    getUserCreditRates(userId: number): Promise<UserCreditRatesData | undefined>;
    upsertUserCreditRates(rates: InsertUserCreditRatesData): Promise<UserCreditRatesData>;
    addCredits(userId: number, amount: number, description: string): Promise<{ success: boolean; balance: number; transaction: CreditTransactionData }>;
    deductCredits(userId: number, amount: number, description: string, referenceType?: string, referenceId?: number): Promise<{ success: boolean; balance?: number; message?: string; transaction?: CreditTransactionData }>;
    getCreditTransactions(userId: number, limit?: number, offset?: number): Promise<CreditTransactionData[]>;
    getCreditPackages(): Promise<CreditPackageData[]>;
  }
}

// Initialize credit storage on MemStorage
(MemStorage.prototype as any).userCreditRates = new Map<number, UserCreditRatesData>();
(MemStorage.prototype as any).creditTransactions = new Map<number, CreditTransactionData[]>();
(MemStorage.prototype as any).creditTransactionIdCounter = 1;
(MemStorage.prototype as any).creditPackages = [
  { id: 1, name: 'Starter', credits: 100, price: '10.00', description: 'Perfect for getting started', isActive: true, sortOrder: 1, createdAt: new Date() },
  { id: 2, name: 'Pro', credits: 500, price: '45.00', description: 'Best value for growing businesses', isActive: true, sortOrder: 2, createdAt: new Date() },
  { id: 3, name: 'Enterprise', credits: 2000, price: '150.00', description: 'High volume messaging', isActive: true, sortOrder: 3, createdAt: new Date() },
];

MemStorage.prototype.getUserCreditRates = async function(userId: number): Promise<UserCreditRatesData | undefined> {
  return (this as any).userCreditRates.get(userId);
};

MemStorage.prototype.upsertUserCreditRates = async function(rates: InsertUserCreditRatesData): Promise<UserCreditRatesData> {
  const existing = (this as any).userCreditRates.get(rates.userId);
  const now = new Date();
  
  if (existing) {
    const updated: UserCreditRatesData = {
      ...existing,
      ...rates,
      updatedAt: now,
    };
    (this as any).userCreditRates.set(rates.userId, updated);
    return updated;
  }
  
  const newRates: UserCreditRatesData = {
    id: rates.userId,
    userId: rates.userId,
    smsOutboundCredits: rates.smsOutboundCredits ?? 1,
    smsInboundCredits: rates.smsInboundCredits ?? 0,
    mmsOutboundCredits: rates.mmsOutboundCredits ?? 3,
    mmsInboundCredits: rates.mmsInboundCredits ?? 0,
    creditPurchaseRate: rates.creditPurchaseRate ?? "0.01",
    lowBalanceThreshold: rates.lowBalanceThreshold ?? 50,
    createdAt: now,
    updatedAt: now,
  };
  
  (this as any).userCreditRates.set(rates.userId, newRates);
  return newRates;
};

MemStorage.prototype.addCredits = async function(userId: number, amount: number, description: string): Promise<{ success: boolean; balance: number; transaction: CreditTransactionData }> {
  const user = await this.getUser(userId);
  if (!user) {
    throw new Error("User not found");
  }
  
  const newBalance = (user.credits || 0) + amount;
  await this.updateUser(userId, { credits: newBalance });
  
  const transactionId = (this as any).creditTransactionIdCounter++;
  const transaction: CreditTransactionData = {
    id: transactionId,
    userId,
    type: 'purchase',
    amount,
    balanceAfter: newBalance,
    description,
    referenceType: null,
    referenceId: null,
    createdAt: new Date(),
  };
  
  const userTransactions = (this as any).creditTransactions.get(userId) || [];
  userTransactions.unshift(transaction);
  (this as any).creditTransactions.set(userId, userTransactions);
  
  return { success: true, balance: newBalance, transaction };
};

MemStorage.prototype.deductCredits = async function(userId: number, amount: number, description: string, referenceType?: string, referenceId?: number): Promise<{ success: boolean; balance?: number; message?: string; transaction?: CreditTransactionData }> {
  const user = await this.getUser(userId);
  if (!user) {
    return { success: false, message: "User not found" };
  }
  
  const currentBalance = user.credits || 0;
  if (currentBalance < amount) {
    return { success: false, message: "Insufficient credits", balance: currentBalance };
  }
  
  const newBalance = currentBalance - amount;
  await this.updateUser(userId, { credits: newBalance });
  
  const transactionId = (this as any).creditTransactionIdCounter++;
  const transaction: CreditTransactionData = {
    id: transactionId,
    userId,
    type: 'consumption',
    amount: -amount,
    balanceAfter: newBalance,
    description,
    referenceType: referenceType || null,
    referenceId: referenceId || null,
    createdAt: new Date(),
  };
  
  const userTransactions = (this as any).creditTransactions.get(userId) || [];
  userTransactions.unshift(transaction);
  (this as any).creditTransactions.set(userId, userTransactions);
  
  return { success: true, balance: newBalance, transaction };
};

MemStorage.prototype.getCreditTransactions = async function(userId: number, limit: number = 50, offset: number = 0): Promise<CreditTransactionData[]> {
  const transactions = (this as any).creditTransactions.get(userId) || [];
  return transactions.slice(offset, offset + limit);
};

MemStorage.prototype.getCreditPackages = async function(): Promise<CreditPackageData[]> {
  return (this as any).creditPackages.filter((p: CreditPackageData) => p.isActive);
};
