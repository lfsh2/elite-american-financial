/**
 * Provider Abstraction Layer - Type Definitions
 * 
 * This module defines the interfaces that all communication providers must implement.
 * This allows the application to work with Twilio, Commio, Bandwidth, etc. uniformly.
 */

// ============================================
// COMMON TYPES
// ============================================

export type ProviderCode = 'twilio' | 'commio' | 'bandwidth';

export interface ProviderCredentials {
  accountSid: string;
  authToken: string;
  apiKey?: string;
  apiSecret?: string;
  apiUsername?: string;
  apiPassword?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ============================================
// PHONE NUMBERS
// ============================================

export interface PhoneNumberCapabilities {
  sms: boolean;
  voice: boolean;
  mms: boolean;
  fax?: boolean;
}

export type A2PStatus = 'registered' | 'pending' | 'not_registered' | 'unknown';

export interface PhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: PhoneNumberCapabilities;
  status: 'active' | 'released' | 'pending';
  monthlyCost?: number;
  dateCreated: string;
  a2pStatus?: A2PStatus;
}

export interface PurchaseNumberOptions {
  areaCode?: string;
  country?: string;
  contains?: string;
  smsEnabled?: boolean;
  voiceEnabled?: boolean;
}

// ============================================
// MESSAGING
// ============================================

export type MessageStatus = 
  | 'queued' 
  | 'sending' 
  | 'sent' 
  | 'delivered' 
  | 'undelivered' 
  | 'failed' 
  | 'received';

export type MessageDirection = 'inbound' | 'outbound-api' | 'outbound-call' | 'outbound-reply';

export interface Message {
  sid: string;
  from: string;
  to: string;
  body: string;
  status: MessageStatus;
  direction: MessageDirection;
  dateSent: string;
  dateCreated: string;
  price?: string;
  priceUnit?: string;
  numSegments?: string;
  mediaUrls?: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface SendMessageOptions {
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

export interface SendMessageResult {
  success: boolean;
  sid?: string;
  status?: MessageStatus;
  error?: string;
}

// ============================================
// VOICE CALLS
// ============================================

export type CallStatus = 
  | 'queued' 
  | 'ringing' 
  | 'in-progress' 
  | 'completed' 
  | 'busy' 
  | 'failed' 
  | 'no-answer' 
  | 'canceled';

export type CallDirection = 'inbound' | 'outbound-api' | 'outbound-dial';

export interface Call {
  sid: string;
  from: string;
  to: string;
  status: CallStatus;
  direction: CallDirection;
  duration: string;
  startTime: string;
  endTime?: string;
  price?: string;
  priceUnit?: string;
  answeredBy?: string;
  recordingUrl?: string;
}

export interface MakeCallOptions {
  to: string;
  from: string;
  url?: string;  // TwiML URL
  twiml?: string; // Inline TwiML
  statusCallback?: string;
  record?: boolean;
  timeout?: number;
}

export interface MakeCallResult {
  success: boolean;
  sid?: string;
  status?: CallStatus;
  error?: string;
}

// ============================================
// USAGE & ANALYTICS
// ============================================

export interface UsageRecord {
  category: string;
  description: string;
  count: number;
  countUnit: string;
  price: number;
  priceUnit: string;
  startDate: string;
  endDate: string;
}

export interface AccountInfo {
  sid: string;
  friendlyName: string;
  status: string;
  type: string;
  dateCreated: string;
  dateUpdated: string;
}

export interface ProviderMetrics {
  // Messages - Current
  totalMessagesSentToday: number;
  totalMessagesSentThisWeek: number;
  totalMessagesSentThisMonth: number;
  totalMessagesReceivedToday: number;
  
  // Messages - Historical (for comparison)
  totalMessagesSentYesterday?: number;
  totalMessagesSentLastWeek?: number;
  totalMessagesSentLastMonth?: number;
  
  // Calls - Current
  totalCallsToday: number;
  totalCallsThisWeek: number;
  totalCallDurationToday: number;
  
  // Calls - Historical (for comparison)
  totalCallsYesterday?: number;
  totalCallsLastWeek?: number;
  totalCallsThisMonth?: number;
  totalCallsLastMonth?: number;
  
  // Costs
  totalSpendToday: number;
  totalSpendThisWeek: number;
  totalSpendThisMonth: number;
  totalSpendLastMonth?: number;
  
  // Delivery
  deliveryRate: number;
  failureRate: number;
}

export interface ProviderAnalytics {
  account: AccountInfo;
  phoneNumbers: PhoneNumber[];
  messages: {
    today: Message[];
    yesterday?: Message[];
    thisWeek: Message[];
    lastWeek?: Message[];
    thisMonth: Message[];
    lastMonth?: Message[];
    all?: Message[]; // Full historical data for charts
  };
  calls: {
    today: Call[];
    yesterday?: Call[];
    thisWeek: Call[];
    lastWeek?: Call[];
    thisMonth: Call[];
    lastMonth?: Call[];
    all?: Call[]; // Full historical data for charts
  };
  usage: UsageRecord[];
  metrics: ProviderMetrics;
}

// ============================================
// PROVIDER INTERFACE
// ============================================

/**
 * Communication Provider Interface
 * 
 * All providers (Twilio, Commio, Bandwidth) must implement this interface.
 * This ensures consistent behavior across different communication platforms.
 */
export interface ICommunicationProvider {
  /** Provider identifier */
  readonly code: ProviderCode;
  readonly name: string;
  
  // ---- Authentication ----
  
  /**
   * Validate provider credentials
   * @returns true if credentials are valid
   */
  validateCredentials(): Promise<boolean>;
  
  /**
   * Get account information
   */
  getAccountInfo(): Promise<AccountInfo>;
  
  // ---- Phone Numbers ----
  
  /**
   * List all phone numbers on the account
   */
  getPhoneNumbers(): Promise<PhoneNumber[]>;
  
  /**
   * Search for available phone numbers to purchase
   */
  searchAvailableNumbers(options: PurchaseNumberOptions): Promise<PhoneNumber[]>;
  
  /**
   * Purchase a phone number
   */
  purchaseNumber(phoneNumber: string): Promise<PhoneNumber>;
  
  /**
   * Release a phone number
   */
  releaseNumber(phoneNumber: string): Promise<boolean>;
  
  // ---- Messaging ----
  
  /**
   * Send an SMS/MMS message
   */
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;
  
  /**
   * Get messages within a date range
   */
  getMessages(dateRange: DateRange): Promise<Message[]>;
  
  /**
   * Get a single message by SID
   */
  getMessage(sid: string): Promise<Message | null>;
  
  // ---- Voice Calls ----
  
  /**
   * Initiate an outbound call
   */
  makeCall(options: MakeCallOptions): Promise<MakeCallResult>;
  
  /**
   * Get calls within a date range
   */
  getCalls(dateRange: DateRange): Promise<Call[]>;
  
  /**
   * Get a single call by SID
   */
  getCall(sid: string): Promise<Call | null>;
  
  // ---- Analytics ----
  
  /**
   * Get usage records for billing
   */
  getUsage(dateRange: DateRange): Promise<UsageRecord[]>;
  
  /**
   * Get comprehensive analytics
   */
  getAnalytics(): Promise<ProviderAnalytics>;
  
  /**
   * Get quick metrics summary
   */
  getMetrics(): Promise<ProviderMetrics>;
}

/**
 * Provider configuration for initialization
 */
export interface ProviderConfig {
  code: ProviderCode;
  credentials: ProviderCredentials;
  accountId?: number; // Database account ID
}
