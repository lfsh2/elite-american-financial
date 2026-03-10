import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, index } from "drizzle-orm/pg-core";
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
  role: text("role").notNull().default("user"), // super_admin, user (client)
  status: text("status").notNull().default("active"), // active, inactive, suspended
  credits: integer("credits").notNull().default(0),
  parentId: integer("parent_id").references(() => users.id),
  isSubAccount: boolean("is_sub_account").notNull().default(false),
  // Assigned phone number for this user (set by admin)
  assignedPhoneNumberId: integer("assigned_phone_number_id"),
  // Auto-refill settings
  autoRefillEnabled: boolean("auto_refill_enabled").default(false),
  autoRefillThreshold: integer("auto_refill_threshold").default(100),
  autoRefillAmount: integer("auto_refill_amount").default(1000),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  credits: true,
  isSubAccount: true,
  autoRefillEnabled: true,
  autoRefillThreshold: true,
  autoRefillAmount: true,
});

// SMS messages with indexes for scalability
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
  messageSid: text("message_sid").unique(), // Unique constraint for deduplication
  campaignId: integer("campaign_id").references(() => smsCampaigns.id),
  mediaUrls: text("media_urls").array(),
  providerCode: text("provider_code"), // twilio, commio, bandwidth
  price: text("price"), // Cost from provider (e.g., "0.0075")
  priceUnit: text("price_unit"), // Currency (e.g., "USD")
  segmentCount: integer("segment_count"), // Number of segments for long messages
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Performance indexes for common queries
  userSentAtIdx: index("idx_sms_user_sent").on(table.userId, table.sentAt),
  accountSentAtIdx: index("idx_sms_account_sent").on(table.accountId, table.sentAt),
  fromIdx: index("idx_sms_from").on(table.from),
  toIdx: index("idx_sms_to").on(table.to),
  statusIdx: index("idx_sms_status").on(table.status),
  directionIdx: index("idx_sms_direction").on(table.direction),
  messageSidIdx: index("idx_sms_message_sid").on(table.messageSid),
}));

export const insertSmsSchema = createInsertSchema(smsMessages).omit({
  id: true,
  createdAt: true,
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
  birthday: text("birthday"), // Format: YYYY-MM-DD
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  tags: text("tags").array(),
  source: text("source"), // e.g., 'sms', 'manual', 'import'
  customFields: jsonb("custom_fields"), // Custom fields from CSV import (e.g., debt_loads, dollar_amount)
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
  recipientLimit: integer("recipient_limit"), // Maximum allowed recipients (null = no limit)
  
  // Scheduling
  status: text("status").notNull().default("draft"), // draft, scheduled, sending, paused, completed, cancelled
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Send mode: 'immediate', 'scheduled', 'drip'
  sendMode: text("send_mode").notNull().default("immediate"),
  
  // Drip mode settings
  dripMessagesPerMinute: integer("drip_messages_per_minute").default(30),
  dripConcurrentPerNumber: integer("drip_concurrent_per_number").default(20),
  
  // Sending options
  sendingRate: integer("sending_rate").default(1), // Messages per second
  timezone: text("timezone").default("UTC"),
  timezoneSchedulingEnabled: boolean("timezone_scheduling_enabled").default(false),
  
  // Campaign options
  forwardNumberOverride: text("forward_number_override"),
  filterChannelsEnabled: boolean("filter_channels_enabled").default(false),
  disableClaimsEnabled: boolean("disable_claims_enabled").default(false),
  optOutMessageEnabled: boolean("opt_out_message_enabled").default(false),
  optOutMessageText: text("opt_out_message_text").default("Reply STOP to Opt-Out"),
  
  // Automated response
  autoResponseEnabled: boolean("auto_response_enabled").default(false),
  autoResponseMessage: text("auto_response_message"),
  autoResponseKeywords: text("auto_response_keywords").array(),
  
  // Stats
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  failedCount: integer("failed_count").default(0),
  optOutCount: integer("opt_out_count").default(0),
  responseCount: integer("response_count").default(0),
  linkClickCount: integer("link_click_count").default(0),
  invalidNumberCount: integer("invalid_number_count").default(0),
  spamReportCount: integer("spam_report_count").default(0),
  
  // Archive
  isArchived: boolean("is_archived").default(false),
  
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
  responseCount: true,
  linkClickCount: true,
  invalidNumberCount: true,
  spamReportCount: true,
  isArchived: true,
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
  assignedFromNumber: text("assigned_from_number"), // Sender number assigned to this recipient (prevents multiple senders)
  
  // Delivery info
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  
  recipientTimezone: text("recipient_timezone"),
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

// Campaign Permissions
export const campaignPermissions = pgTable("campaign_permissions", {
  id: serial("id").primaryKey(),
  smsCampaignId: integer("sms_campaign_id").notNull().references(() => smsCampaigns.id),
  userId: integer("user_id").references(() => users.id),
  userGroup: text("user_group"),
  permissionType: text("permission_type").notNull().default("view"), // view, send, manage
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCampaignPermissionSchema = createInsertSchema(campaignPermissions).omit({
  id: true,
  createdAt: true,
});

export type CampaignPermission = typeof campaignPermissions.$inferSelect;
export type InsertCampaignPermission = z.infer<typeof insertCampaignPermissionSchema>;

// Message Templates (reusable campaign message templates)
export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  accountId: integer("account_id").references(() => accounts.id),
  name: text("name").notNull(),
  content: text("content").notNull(), // The message template with merge tags
  description: text("description"),
  category: text("category"), // e.g., 'debt_collection', 'marketing', 'notifications'
  isDefault: boolean("is_default").default(false),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = z.infer<typeof insertMessageTemplateSchema>;

// User Phone Assignments (many-to-many: users can have multiple assigned numbers)
export const userPhoneAssignments = pgTable("user_phone_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  phoneNumberId: integer("phone_number_id").notNull().references(() => accountPhoneNumbers.id),
  isPrimary: boolean("is_primary").default(false),
  canSend: boolean("can_send").default(true),
  canReceive: boolean("can_receive").default(true),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: integer("assigned_by").references(() => users.id), // Admin who assigned
});

export const insertUserPhoneAssignmentSchema = createInsertSchema(userPhoneAssignments).omit({
  id: true,
  assignedAt: true,
});

export type UserPhoneAssignment = typeof userPhoneAssignments.$inferSelect;
export type InsertUserPhoneAssignment = z.infer<typeof insertUserPhoneAssignmentSchema>;

// ============================================
// USAGE-BASED PRICING TABLES
// ============================================

// User Pricing Configuration - rates set by admin per client
export const userPricingConfig = pgTable("user_pricing_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  // SMS rates (in dollars, e.g., 0.015 = $0.015 per message)
  smsOutboundRate: text("sms_outbound_rate").notNull().default("0.015"),
  smsInboundRate: text("sms_inbound_rate").notNull().default("0.01"),
  // MMS rates
  mmsOutboundRate: text("mms_outbound_rate").notNull().default("0.05"),
  mmsInboundRate: text("mms_inbound_rate").notNull().default("0.03"),
  // Monthly phone number fee (optional recurring charge)
  monthlyPhoneNumberFee: text("monthly_phone_number_fee").notNull().default("0"),
  // Billing cycle (1-28, day of month billing starts)
  billingCycleDay: integer("billing_cycle_day").notNull().default(1),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserPricingConfigSchema = createInsertSchema(userPricingConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserPricingConfig = typeof userPricingConfig.$inferSelect;
export type InsertUserPricingConfig = z.infer<typeof insertUserPricingConfigSchema>;

// User Usage Records - tracks each message for billing
export const userUsageRecords = pgTable("user_usage_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  phoneNumberId: integer("phone_number_id").references(() => accountPhoneNumbers.id),
  // Message details
  messageType: text("message_type").notNull(), // 'sms' | 'mms'
  direction: text("direction").notNull(), // 'inbound' | 'outbound'
  segmentCount: integer("segment_count").notNull().default(1), // For long SMS
  // Cost calculation
  rateApplied: text("rate_applied").notNull(), // Rate at time of message
  cost: text("cost").notNull(), // Calculated cost
  // Reference to actual message
  messageSid: text("message_sid"),
  smsMessageId: integer("sms_message_id").references(() => smsMessages.id),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserUsageRecordSchema = createInsertSchema(userUsageRecords).omit({
  id: true,
  createdAt: true,
});

export type UserUsageRecord = typeof userUsageRecords.$inferSelect;
export type InsertUserUsageRecord = z.infer<typeof insertUserUsageRecordSchema>;

// User Billing Summary - monthly billing periods
export const userBillingSummary = pgTable("user_billing_summary", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  // Billing period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  // Usage totals
  totalSmsOutbound: integer("total_sms_outbound").notNull().default(0),
  totalSmsInbound: integer("total_sms_inbound").notNull().default(0),
  totalMmsOutbound: integer("total_mms_outbound").notNull().default(0),
  totalMmsInbound: integer("total_mms_inbound").notNull().default(0),
  // Cost breakdown
  smsCost: text("sms_cost").notNull().default("0"),
  mmsCost: text("mms_cost").notNull().default("0"),
  phoneNumberFees: text("phone_number_fees").notNull().default("0"),
  totalCost: text("total_cost").notNull().default("0"),
  // Payment status
  status: text("status").notNull().default("pending"), // 'pending' | 'paid' | 'overdue'
  paidAt: timestamp("paid_at"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserBillingSummarySchema = createInsertSchema(userBillingSummary).omit({
  id: true,
  createdAt: true,
});

export type UserBillingSummary = typeof userBillingSummary.$inferSelect;
export type InsertUserBillingSummary = z.infer<typeof insertUserBillingSummarySchema>;

// ============================================
// CREDIT-BASED SYSTEM
// ============================================

// Credit Transactions - tracks all credit movements
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  // Transaction type
  type: text("type").notNull(), // 'purchase' | 'consumption' | 'refund' | 'bonus' | 'adjustment'
  // Amount (positive = add, negative = deduct)
  amount: integer("amount").notNull(),
  // Balance after this transaction
  balanceAfter: integer("balance_after").notNull(),
  // Description
  description: text("description").notNull(),
  // Reference to related entity (message ID, invoice ID, etc.)
  referenceType: text("reference_type"), // 'sms' | 'mms' | 'invoice' | null
  referenceId: integer("reference_id"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// User Credit Rates - how many credits per message type
export const userCreditRates = pgTable("user_credit_rates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  // Credits per message type
  smsOutboundCredits: integer("sms_outbound_credits").notNull().default(1),
  smsInboundCredits: integer("sms_inbound_credits").notNull().default(0),
  mmsOutboundCredits: integer("mms_outbound_credits").notNull().default(3),
  mmsInboundCredits: integer("mms_inbound_credits").notNull().default(0),
  // Credit purchase rate (dollars per credit, for reference)
  creditPurchaseRate: text("credit_purchase_rate").notNull().default("0.01"),
  // Low balance threshold for alerts
  lowBalanceThreshold: integer("low_balance_threshold").notNull().default(50),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserCreditRatesSchema = createInsertSchema(userCreditRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserCreditRates = typeof userCreditRates.$inferSelect;
export type InsertUserCreditRates = z.infer<typeof insertUserCreditRatesSchema>;

// Credit Packages - predefined credit bundles for purchase
export const creditPackages = pgTable("credit_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Starter", "Pro", "Enterprise"
  credits: integer("credits").notNull(), // 100, 500, 2000
  price: text("price").notNull(), // "$10", "$45", "$150"
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditPackageSchema = createInsertSchema(creditPackages).omit({
  id: true,
  createdAt: true,
});

export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;

// Conversation metadata for SMS inbox filters (starred, read status)
export const conversationMetadata = pgTable("conversation_metadata", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  contactPhone: text("contact_phone").notNull(),
  isStarred: boolean("is_starred").notNull().default(false),
  lastReadAt: timestamp("last_read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint: one metadata record per user+contact combination
  userContactIdx: index("idx_conv_meta_user_contact").on(table.userId, table.contactPhone),
}));

export const insertConversationMetadataSchema = createInsertSchema(conversationMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ConversationMetadata = typeof conversationMetadata.$inferSelect;
export type InsertConversationMetadata = z.infer<typeof insertConversationMetadataSchema>;
