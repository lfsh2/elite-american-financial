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
    
    // Create default admin user
    this.createUser({
      username: "admin",
      password: "admin123", // In real app, would be hashed
      firstName: "Admin",
      lastName: "User",
      email: "admin@eliteamericanfinancials.com",
      role: "admin"
    });
  }

  // User Management
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase()
    );
  }

  async createUser(userData: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    
    const user: User = {
      id,
      ...userData,
      credits: 100, // Give new users some initial credits
      isSubAccount: !!userData.parentId,
    };
    
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async deleteUser(id: number): Promise<boolean> {
    return this.users.delete(id);
  }

  async getSubAccounts(userId: number): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (user) => user.parentId === userId
    );
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
}

export const storage = new MemStorage();
