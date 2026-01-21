import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { randomBytes } from "crypto";

// User management
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"), // admin, user
  credits: integer("credits").notNull().default(0),
  parentId: integer("parent_id").references(() => users.id),
  isSubAccount: boolean("is_sub_account").notNull().default(false),
  // Auto-refill settings
  autoRefillEnabled: boolean("auto_refill_enabled").default(false),
  autoRefillThreshold: integer("auto_refill_threshold").default(100),
  autoRefillAmount: integer("auto_refill_amount").default(1000),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  credits: true,
  isSubAccount: true,
  autoRefillEnabled: true,
  autoRefillThreshold: true,
  autoRefillAmount: true,
});

// SMS messages
export const smsMessages = pgTable("sms_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id"), // Links to accounts table for multi-tenant isolation
  to: text("to").notNull(),
  from: text("from").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(), // sent, delivered, failed
  direction: text("direction").notNull(), // inbound, outbound
  sentAt: timestamp("sent_at").notNull(),
  messageSid: text("message_sid"),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  mediaUrls: text("media_urls").array(),
});

export const insertSmsSchema = createInsertSchema(smsMessages).omit({
  id: true,
  sentAt: true,
  messageSid: true,
});

// Voice calls
export const voiceCalls = pgTable("voice_calls", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id"), // Links to accounts table for multi-tenant isolation
  to: text("to").notNull(),
  from: text("from").notNull(),
  status: text("status").notNull(), // in-progress, completed, no-answer, failed
  direction: text("direction").notNull(), // inbound, outbound
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // in seconds
  callSid: text("call_sid"),
  recordingUrl: text("recording_url"),
});

export const insertVoiceCallSchema = createInsertSchema(voiceCalls).omit({
  id: true,
  startTime: true,
  endTime: true,
  duration: true,
  callSid: true,
  recordingUrl: true,
});

// Email messages
export const emailMessages = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  to: text("to").notNull(),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(), // sent, delivered, failed
  sentAt: timestamp("sent_at").notNull(),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  messageId: text("message_id"), // SendGrid message ID
});

export const insertEmailSchema = createInsertSchema(emailMessages).omit({
  id: true,
  sentAt: true,
});

// Campaigns
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id"), // Links to accounts table for multi-tenant isolation
  name: text("name").notNull(),
  type: text("type").notNull(), // sms, voice, email
  status: text("status").notNull(), // draft, scheduled, active, completed, paused
  message: text("message").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  deliveredCount: integer("delivered_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  scheduledFor: timestamp("scheduled_for"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").notNull(),
  metadata: jsonb("metadata"), // Additional campaign settings
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  sentCount: true,
  deliveredCount: true,
  failedCount: true,
  createdAt: true,
});

// Contacts
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});

// Billing transactions
export const billingTransactions = pgTable("billing_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: doublePrecision("amount").notNull(),
  type: text("type").notNull(), // credit-purchase, credit-usage
  description: text("description").notNull(),
  credits: integer("credits"),
  createdAt: timestamp("created_at").notNull(),
});

export const insertBillingSchema = createInsertSchema(billingTransactions).omit({
  id: true,
  createdAt: true,
});

// Define types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type SmsMessage = typeof smsMessages.$inferSelect;
export type InsertSmsMessage = z.infer<typeof insertSmsSchema>;

export type VoiceCall = typeof voiceCalls.$inferSelect;
export type InsertVoiceCall = z.infer<typeof insertVoiceCallSchema>;

export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = z.infer<typeof insertEmailSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type BillingTransaction = typeof billingTransactions.$inferSelect;
export type InsertBillingTransaction = z.infer<typeof insertBillingSchema>;

// API keys for external access
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  secret: text("secret").notNull(),
  permissions: text("permissions").array(), // sms:read, sms:write, voice:read, etc.
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  ipRestrictions: text("ip_restrictions").array(), // List of allowed IP addresses/ranges
  usageLimit: integer("usage_limit"), // Max number of requests per day
  usageCount: integer("usage_count").default(0), // Current usage count
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  key: true,
  secret: true,
  lastUsed: true,
  createdAt: true,
});

// Generate default API key value with secure random bytes
export const generateApiKey = () => {
  return {
    key: `tf_${randomBytes(16).toString('hex')}`,
    secret: randomBytes(32).toString('hex'),
  };
};

// Webhooks for event notifications
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events").array(), // sms.received, sms.sent, call.received, etc.
  createdAt: timestamp("created_at").notNull(),
  active: boolean("active").notNull().default(true),
  secret: text("secret"), // For signature verification
  failCount: integer("fail_count").notNull().default(0),
  lastResponse: jsonb("last_response"),
  retryEnabled: boolean("retry_enabled").default(true),
  retryCount: integer("retry_count").default(3), // Number of retry attempts
  retryInterval: integer("retry_interval").default(60), // Seconds between retries
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  deliveryLogs: jsonb("delivery_logs"), // Recent delivery attempt logs
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  failCount: true,
  lastResponse: true,
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

// ============================================
// MULTI-ACCOUNT SYSTEM
// ============================================

// Communication Providers (Twilio, Commio, Bandwidth, etc.)
export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 'twilio', 'commio', 'bandwidth'
  name: text("name").notNull(), // 'Twilio', 'Commio', 'Bandwidth'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providers).omit({
  id: true,
  createdAt: true,
});

// Organizations (Top-level entity - the SyncGrid workspace)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  ownerUserId: integer("owner_user_id").notNull().references(() => users.id),
  plan: text("plan").notNull().default("starter"), // starter, pro, enterprise
  status: text("status").notNull().default("active"), // active, suspended, cancelled
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Accounts (Master accounts and Sub-accounts)
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  parentAccountId: integer("parent_account_id").references((): any => accounts.id), // NULL = Master Account
  providerId: integer("provider_id").notNull().references(() => providers.id),
  
  name: text("name").notNull(), // "Main Twilio Account" or "Client A"
  type: text("type").notNull(), // 'master' or 'subaccount'
  status: text("status").notNull().default("active"), // active, suspended, closed
  
  // Provider Credentials (should be encrypted in production)
  accountSid: text("account_sid"), // Twilio SID or Commio Account ID
  authToken: text("auth_token"), // Encrypted
  apiKey: text("api_key"), // Optional API Key
  apiSecret: text("api_secret"), // Encrypted
  
  // Settings
  friendlyName: text("friendly_name"),
  defaultPhoneNumber: text("default_phone_number"),
  timezone: text("timezone").default("UTC"),
  settings: jsonb("settings").default({}),
  
  // Cached metrics (updated periodically)
  phoneNumberCount: integer("phone_number_count").default(0),
  monthlySpend: doublePrecision("monthly_spend").default(0),
  lastSyncAt: timestamp("last_sync_at"),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  phoneNumberCount: true,
  monthlySpend: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

// Account Phone Numbers
export const accountPhoneNumbers = pgTable("account_phone_numbers", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  phoneNumber: text("phone_number").notNull(),
  friendlyName: text("friendly_name"),
  capabilities: jsonb("capabilities").default({ sms: true, voice: true, mms: false }),
  providerSid: text("provider_sid"), // Provider's ID for this number
  isDefault: boolean("is_default").default(false),
  status: text("status").notNull().default("active"), // active, released, pending
  monthlyCost: doublePrecision("monthly_cost"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountPhoneNumberSchema = createInsertSchema(accountPhoneNumbers).omit({
  id: true,
  createdAt: true,
});

// Account Users (who can access which account)
export const accountUsers = pgTable("account_users", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("member"), // owner, admin, member, viewer
  permissions: jsonb("permissions").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountUserSchema = createInsertSchema(accountUsers).omit({
  id: true,
  createdAt: true,
});

// Types for multi-account system
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

export type AccountPhoneNumber = typeof accountPhoneNumbers.$inferSelect;
export type InsertAccountPhoneNumber = z.infer<typeof insertAccountPhoneNumberSchema>;

export type AccountUser = typeof accountUsers.$inferSelect;
export type InsertAccountUser = z.infer<typeof insertAccountUserSchema>;

// ============================================
// BRAND & MESSAGING CAMPAIGNS (A2P 10DLC)
// ============================================

// Brand Registrations (Company/Business registration for A2P)
export const brandRegistrations = pgTable("brand_registrations", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  userId: integer("user_id").notNull().references(() => users.id),
  
  // Business Information
  companyName: text("company_name").notNull(),
  ein: text("ein"), // Employer Identification Number
  businessType: text("business_type").notNull(), // sole_proprietor, partnership, corporation, llc, nonprofit
  vertical: text("vertical").notNull(), // real_estate, financial, healthcare, etc.
  
  // Contact Information
  contactFirstName: text("contact_first_name").notNull(),
  contactLastName: text("contact_last_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  
  // Address
  street: text("street"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country").default("US"),
  
  // Website & Social
  websiteUrl: text("website_url"),
  
  // Registration Status
  status: text("status").notNull().default("draft"), // draft, pending, approved, rejected, suspended
  externalBrandId: text("external_brand_id"), // TCR Brand ID or Twilio Brand SID
  brandScore: integer("brand_score"), // Trust score from TCR
  
  // Provider tracking
  providerId: integer("provider_id").references(() => providers.id),
  providerBrandSid: text("provider_brand_sid"), // Twilio/Commio brand SID
  
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBrandRegistrationSchema = createInsertSchema(brandRegistrations).omit({
  id: true,
  externalBrandId: true,
  brandScore: true,
  providerBrandSid: true,
  submittedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
});

// Messaging Campaigns (Use case registration)
export const messagingCampaigns = pgTable("messaging_campaigns", {
  id: serial("id").primaryKey(),
  brandRegistrationId: integer("brand_registration_id").notNull().references(() => brandRegistrations.id),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  userId: integer("user_id").notNull().references(() => users.id),
  
  // Campaign Details
  campaignName: text("campaign_name").notNull(),
  description: text("description").notNull(),
  useCase: text("use_case").notNull(), // marketing, notifications, customer_care, delivery_notifications, etc.
  subUseCase: text("sub_use_case"), // More specific use case
  
  // Message Content
  sampleMessages: text("sample_messages").array(), // Required sample messages
  messageFlow: text("message_flow"), // Description of how messages are triggered
  
  // Opt-in/Opt-out
  optInType: text("opt_in_type").notNull(), // verbal, web_form, text, paper_form
  optInMessage: text("opt_in_message"),
  optOutMessage: text("opt_out_message").default("Reply STOP to unsubscribe"),
  helpMessage: text("help_message").default("Reply HELP for assistance"),
  optInKeywords: text("opt_in_keywords").array().default(["START", "YES", "SUBSCRIBE"]),
  optOutKeywords: text("opt_out_keywords").array().default(["STOP", "UNSUBSCRIBE", "CANCEL"]),
  helpKeywords: text("help_keywords").array().default(["HELP", "INFO"]),
  
  // Content flags
  hasEmbeddedLinks: boolean("has_embedded_links").default(false),
  hasEmbeddedPhone: boolean("has_embedded_phone").default(false),
  hasAgeGatedContent: boolean("has_age_gated_content").default(false),
  
  // Registration Status
  status: text("status").notNull().default("draft"), // draft, pending, approved, rejected, suspended
  externalCampaignId: text("external_campaign_id"), // TCR Campaign ID
  
  // Provider tracking
  providerCampaignSid: text("provider_campaign_sid"), // Twilio/Commio campaign SID
  messagingServiceSid: text("messaging_service_sid"), // Twilio Messaging Service SID
  
  // Rate limits (from TCR/carrier)
  dailyLimit: integer("daily_limit"),
  monthlyLimit: integer("monthly_limit"),
  throughputLimit: integer("throughput_limit"), // Messages per second
  
  // Timestamps
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMessagingCampaignSchema = createInsertSchema(messagingCampaigns).omit({
  id: true,
  externalCampaignId: true,
  providerCampaignSid: true,
  messagingServiceSid: true,
  dailyLimit: true,
  monthlyLimit: true,
  throughputLimit: true,
  submittedAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
});

// Contact Lists (for organizing contacts)
export const contactLists = pgTable("contact_lists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id").references(() => accounts.id),
  name: text("name").notNull(),
  description: text("description"),
  contactCount: integer("contact_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContactListSchema = createInsertSchema(contactLists).omit({
  id: true,
  contactCount: true,
  createdAt: true,
  updatedAt: true,
});

// Contact List Members (many-to-many relationship)
export const contactListMembers = pgTable("contact_list_members", {
  id: serial("id").primaryKey(),
  contactListId: integer("contact_list_id").notNull().references(() => contactLists.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertContactListMemberSchema = createInsertSchema(contactListMembers).omit({
  id: true,
  addedAt: true,
});

// SMS Campaigns (actual sending campaigns)
export const smsCampaigns = pgTable("sms_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id").references(() => accounts.id),
  messagingCampaignId: integer("messaging_campaign_id").references(() => messagingCampaigns.id), // Link to registered campaign
  
  // Campaign Info
  name: text("name").notNull(),
  description: text("description"),
  
  // Message Content
  messageTemplate: text("message_template").notNull(), // Supports merge tags like {{firstName}}
  mediaUrls: text("media_urls").array(), // For MMS
  
  // Sender
  fromNumber: text("from_number").notNull(),
  
  // Recipients
  contactListId: integer("contact_list_id").references(() => contactLists.id),
  recipientCount: integer("recipient_count").default(0),
  
  // Scheduling
  status: text("status").notNull().default("draft"), // draft, scheduled, sending, paused, completed, cancelled
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Sending options
  sendingRate: integer("sending_rate").default(1), // Messages per second
  timezone: text("timezone").default("UTC"),
  
  // Stats
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  failedCount: integer("failed_count").default(0),
  optOutCount: integer("opt_out_count").default(0),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSmsCampaignSchema = createInsertSchema(smsCampaigns).omit({
  id: true,
  recipientCount: true,
  startedAt: true,
  completedAt: true,
  sentCount: true,
  deliveredCount: true,
  failedCount: true,
  optOutCount: true,
  createdAt: true,
  updatedAt: true,
});

// Campaign Recipients (individual recipients for a campaign)
export const campaignRecipients = pgTable("campaign_recipients", {
  id: serial("id").primaryKey(),
  smsCampaignId: integer("sms_campaign_id").notNull().references(() => smsCampaigns.id),
  contactId: integer("contact_id").references(() => contacts.id),
  
  // Recipient info (denormalized for performance)
  phoneNumber: text("phone_number").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  customFields: jsonb("custom_fields"), // For merge tags
  
  // Status
  status: text("status").notNull().default("pending"), // pending, sent, delivered, failed, opted_out, skipped
  messageSid: text("message_sid"), // Provider message ID
  
  // Delivery info
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignRecipientSchema = createInsertSchema(campaignRecipients).omit({
  id: true,
  messageSid: true,
  sentAt: true,
  deliveredAt: true,
  failedAt: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
});

// Opt-out list (TCPA compliance)
export const optOutList = pgTable("opt_out_list", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => accounts.id),
  phoneNumber: text("phone_number").notNull(),
  reason: text("reason"), // user_request, carrier_complaint, etc.
  source: text("source"), // keyword, api, manual
  optedOutAt: timestamp("opted_out_at").notNull().defaultNow(),
});

export const insertOptOutSchema = createInsertSchema(optOutList).omit({
  id: true,
  optedOutAt: true,
});

// Types for Brand & Messaging Campaigns
export type BrandRegistration = typeof brandRegistrations.$inferSelect;
export type InsertBrandRegistration = z.infer<typeof insertBrandRegistrationSchema>;

export type MessagingCampaign = typeof messagingCampaigns.$inferSelect;
export type InsertMessagingCampaign = z.infer<typeof insertMessagingCampaignSchema>;

export type ContactList = typeof contactLists.$inferSelect;
export type InsertContactList = z.infer<typeof insertContactListSchema>;

export type ContactListMember = typeof contactListMembers.$inferSelect;
export type InsertContactListMember = z.infer<typeof insertContactListMemberSchema>;

export type SmsCampaign = typeof smsCampaigns.$inferSelect;
export type InsertSmsCampaign = z.infer<typeof insertSmsCampaignSchema>;

export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type InsertCampaignRecipient = z.infer<typeof insertCampaignRecipientSchema>;

export type OptOut = typeof optOutList.$inferSelect;
export type InsertOptOut = z.infer<typeof insertOptOutSchema>;
