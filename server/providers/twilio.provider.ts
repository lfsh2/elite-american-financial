/**
 * Twilio Provider Implementation
 * 
 * Implements the ICommunicationProvider interface for Twilio.
 */

import Twilio from 'twilio';
import type {
  ICommunicationProvider,
  ProviderCredentials,
  ProviderCode,
  DateRange,
  PhoneNumber,
  PurchaseNumberOptions,
  Message,
  SendMessageOptions,
  SendMessageResult,
  Call,
  MakeCallOptions,
  MakeCallResult,
  UsageRecord,
  AccountInfo,
  ProviderAnalytics,
  ProviderMetrics,
} from './types';

export class TwilioProvider implements ICommunicationProvider {
  readonly code: ProviderCode = 'twilio';
  readonly name = 'Twilio';
  
  private client: Twilio.Twilio;
  private accountSid: string;

  constructor(credentials: ProviderCredentials) {
    this.accountSid = credentials.accountSid;
    this.client = Twilio(credentials.accountSid, credentials.authToken);
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async validateCredentials(): Promise<boolean> {
    try {
      const account = await this.client.api.accounts(this.accountSid).fetch();
      return account.status === 'active';
    } catch (error) {
      console.error('Twilio credential validation failed:', error);
      return false;
    }
  }

  async getAccountInfo(): Promise<AccountInfo> {
    const account = await this.client.api.accounts(this.accountSid).fetch();
    return {
      sid: account.sid,
      friendlyName: account.friendlyName,
      status: account.status,
      type: account.type,
      dateCreated: account.dateCreated.toISOString(),
      dateUpdated: account.dateUpdated.toISOString(),
    };
  }

  // ============================================
  // PHONE NUMBERS
  // ============================================

  async getPhoneNumbers(): Promise<PhoneNumber[]> {
    const numbers = await this.client.incomingPhoneNumbers.list({ limit: 100 });
    
    // Fetch A2P registration status for phone numbers
    // Get all messaging services and their phone numbers to determine A2P status
    let a2pPhoneNumbers: Set<string> = new Set();
    let pendingA2pPhoneNumbers: Set<string> = new Set();
    
    try {
      // Get messaging services
      const messagingServices = await this.client.messaging.v1.services.list({ limit: 50 });
      
      for (const service of messagingServices) {
        try {
          // Get phone numbers in this messaging service
          const servicePhoneNumbers = await this.client.messaging.v1
            .services(service.sid)
            .phoneNumbers.list({ limit: 100 });
          
          // Check if this messaging service has an A2P campaign
          // Services with usecase like "notifications", "marketing", etc. are typically A2P registered
          const isA2pService = service.useInboundWebhookOnNumber === false || 
                               service.usecase === 'notifications' ||
                               service.usecase === 'marketing' ||
                               service.usecase === 'verification' ||
                               service.usecase === 'alerts';
          
          for (const pn of servicePhoneNumbers) {
            if (isA2pService) {
              a2pPhoneNumbers.add(pn.phoneNumber);
            }
          }
        } catch (e) {
          // Service might not have phone numbers, continue
        }
      }
      
      // Also try to get US A2P Brand Registrations to check campaign status
      try {
        const campaigns = await this.client.messaging.v1.services.list({ limit: 20 });
        // If we have any campaigns, mark associated numbers
        for (const campaign of campaigns) {
          if (campaign.sid) {
            try {
              const campaignNumbers = await this.client.messaging.v1
                .services(campaign.sid)
                .phoneNumbers.list({ limit: 50 });
              for (const cn of campaignNumbers) {
                a2pPhoneNumbers.add(cn.phoneNumber);
              }
            } catch (e) {
              // Continue
            }
          }
        }
      } catch (e) {
        // A2P API might not be available
      }
    } catch (e) {
      console.log('[Twilio] Could not fetch messaging services for A2P status:', e);
    }
    
    return numbers.map(n => {
      // Determine A2P status
      let a2pStatus: 'registered' | 'pending' | 'not_registered' | 'unknown' = 'unknown';
      
      if (a2pPhoneNumbers.has(n.phoneNumber)) {
        a2pStatus = 'registered';
      } else if (pendingA2pPhoneNumbers.has(n.phoneNumber)) {
        a2pStatus = 'pending';
      } else if (n.capabilities?.sms) {
        // SMS-capable numbers without A2P registration
        a2pStatus = 'not_registered';
      }
      
      return {
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: {
          sms: n.capabilities?.sms || false,
          voice: n.capabilities?.voice || false,
          mms: n.capabilities?.mms || false,
          fax: n.capabilities?.fax || false,
        },
        status: 'active',
        dateCreated: n.dateCreated.toISOString(),
        a2pStatus,
      };
    });
  }

  async searchAvailableNumbers(options: PurchaseNumberOptions): Promise<PhoneNumber[]> {
    const searchParams: any = { limit: 20 };
    
    if (options.areaCode) searchParams.areaCode = options.areaCode;
    if (options.contains) searchParams.contains = options.contains;
    if (options.smsEnabled) searchParams.smsEnabled = options.smsEnabled;
    if (options.voiceEnabled) searchParams.voiceEnabled = options.voiceEnabled;

    const country = options.country || 'US';
    const available = await this.client.availablePhoneNumbers(country).local.list(searchParams);

    return available.map(n => ({
      sid: '',
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      capabilities: {
        sms: n.capabilities?.sms || false,
        voice: n.capabilities?.voice || false,
        mms: n.capabilities?.mms || false,
      },
      status: 'pending' as const,
      dateCreated: new Date().toISOString(),
    }));
  }

  async purchaseNumber(phoneNumber: string): Promise<PhoneNumber> {
    const purchased = await this.client.incomingPhoneNumbers.create({
      phoneNumber,
    });

    return {
      sid: purchased.sid,
      phoneNumber: purchased.phoneNumber,
      friendlyName: purchased.friendlyName,
      capabilities: {
        sms: purchased.capabilities?.sms || false,
        voice: purchased.capabilities?.voice || false,
        mms: purchased.capabilities?.mms || false,
      },
      status: 'active',
      dateCreated: purchased.dateCreated.toISOString(),
    };
  }

  async releaseNumber(phoneNumber: string): Promise<boolean> {
    try {
      // Find the number first
      const numbers = await this.client.incomingPhoneNumbers.list({
        phoneNumber,
        limit: 1,
      });

      if (numbers.length === 0) return false;

      await this.client.incomingPhoneNumbers(numbers[0].sid).remove();
      return true;
    } catch (error) {
      console.error('Failed to release number:', error);
      return false;
    }
  }

  // ============================================
  // MESSAGING
  // ============================================

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    try {
      const messageParams: any = {
        to: options.to,
        from: options.from,
        body: options.body,
      };

      if (options.mediaUrls && options.mediaUrls.length > 0) {
        messageParams.mediaUrl = options.mediaUrls;
      }

      if (options.statusCallback) {
        messageParams.statusCallback = options.statusCallback;
      }

      const message = await this.client.messages.create(messageParams);

      return {
        success: true,
        sid: message.sid,
        status: message.status as any,
      };
    } catch (error: any) {
      console.error('Failed to send message:', error);
      return {
        success: false,
        error: error.message || 'Failed to send message',
      };
    }
  }

  async getMessages(dateRange: DateRange, maxLimit: number = 2000): Promise<Message[]> {
    const allMessages: Message[] = [];
    
    // Limit messages to prevent memory issues - fetch most recent first
    const messages = await this.client.messages.list({
      dateSentAfter: dateRange.startDate,
      dateSentBefore: dateRange.endDate,
      limit: maxLimit, // Reduced limit to prevent OOM errors
    });

    for (const m of messages) {
      allMessages.push({
        sid: m.sid,
        from: m.from,
        to: m.to,
        body: m.body,
        status: m.status as any,
        direction: m.direction as any,
        dateSent: m.dateSent?.toISOString() || m.dateCreated.toISOString(),
        dateCreated: m.dateCreated.toISOString(),
        price: m.price || undefined,
        priceUnit: m.priceUnit || undefined,
        numSegments: m.numSegments || undefined,
        errorCode: m.errorCode?.toString() || undefined,
        errorMessage: m.errorMessage || undefined,
      });
    }

    console.log(`[TwilioProvider] Fetched ${allMessages.length} messages`);
    return allMessages;
  }

  async getMessage(sid: string): Promise<Message | null> {
    try {
      const m = await this.client.messages(sid).fetch();
      return {
        sid: m.sid,
        from: m.from,
        to: m.to,
        body: m.body,
        status: m.status as any,
        direction: m.direction as any,
        dateSent: m.dateSent?.toISOString() || m.dateCreated.toISOString(),
        dateCreated: m.dateCreated.toISOString(),
        price: m.price || undefined,
        priceUnit: m.priceUnit || undefined,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // VOICE CALLS
  // ============================================

  async makeCall(options: MakeCallOptions): Promise<MakeCallResult> {
    try {
      const callParams: any = {
        to: options.to,
        from: options.from,
      };

      if (options.url) {
        callParams.url = options.url;
      } else if (options.twiml) {
        callParams.twiml = options.twiml;
      } else {
        // Default TwiML
        callParams.twiml = '<Response><Say>Hello from Elite Financial</Say></Response>';
      }

      if (options.statusCallback) callParams.statusCallback = options.statusCallback;
      if (options.record) callParams.record = options.record;
      if (options.timeout) callParams.timeout = options.timeout;

      const call = await this.client.calls.create(callParams);

      return {
        success: true,
        sid: call.sid,
        status: call.status as any,
      };
    } catch (error: any) {
      console.error('Failed to make call:', error);
      return {
        success: false,
        error: error.message || 'Failed to make call',
      };
    }
  }

  async getCalls(dateRange: DateRange): Promise<Call[]> {
    const calls = await this.client.calls.list({
      startTimeAfter: dateRange.startDate,
      startTimeBefore: dateRange.endDate,
      limit: 5000,
    });
    
    console.log(`[TwilioProvider] Fetched ${calls.length} calls`);

    return calls.map(c => ({
      sid: c.sid,
      from: c.from,
      to: c.to,
      status: c.status as any,
      direction: c.direction as any,
      duration: c.duration || '0',
      startTime: c.startTime?.toISOString() || c.dateCreated.toISOString(),
      endTime: c.endTime?.toISOString(),
      price: c.price || undefined,
      priceUnit: c.priceUnit || undefined,
      answeredBy: c.answeredBy || undefined,
    }));
  }

  async getCall(sid: string): Promise<Call | null> {
    try {
      const c = await this.client.calls(sid).fetch();
      return {
        sid: c.sid,
        from: c.from,
        to: c.to,
        status: c.status as any,
        direction: c.direction as any,
        duration: c.duration || '0',
        startTime: c.startTime?.toISOString() || c.dateCreated.toISOString(),
        endTime: c.endTime?.toISOString(),
        price: c.price || undefined,
        priceUnit: c.priceUnit || undefined,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // USAGE & ANALYTICS
  // ============================================

  async getUsage(dateRange: DateRange): Promise<UsageRecord[]> {
    const usage = await this.client.usage.records.list({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });

    return usage.map(u => ({
      category: u.category,
      description: u.description,
      count: parseFloat(String(u.count)) || 0,
      countUnit: u.countUnit,
      price: parseFloat(String(u.price)) || 0,
      priceUnit: u.priceUnit,
      startDate: u.startDate?.toISOString() || '',
      endDate: u.endDate?.toISOString() || '',
    }));
  }

  async getAnalytics(): Promise<ProviderAnalytics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Fetch last 14 days for performance (reduced from 45 days for faster dashboard)
    const fetchStartDate = new Date(now);
    fetchStartDate.setDate(fetchStartDate.getDate() - 14);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const yesterday = new Date(startOfDay);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(startOfWeek);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    // Fetch all data in parallel - 14 days with limits for performance
    const [account, phoneNumbers, messagesAll, callsAll, usageAll] = await Promise.all([
      this.getAccountInfo(),
      this.getPhoneNumbers(),
      this.getMessages({ startDate: fetchStartDate, endDate: now }, 500), // Reduced from 2000 for faster load
      this.getCalls({ startDate: fetchStartDate, endDate: now }),
      this.getUsage({ startDate: fetchStartDate, endDate: now }),
    ]);

    // Filter messages by time period
    const messagesToday = messagesAll.filter(m => new Date(m.dateSent) >= startOfDay);
    const messagesYesterday = messagesAll.filter(m => {
      const d = new Date(m.dateSent);
      return d >= yesterday && d < startOfDay;
    });
    const messagesThisWeek = messagesAll.filter(m => new Date(m.dateSent) >= startOfWeek);
    const messagesLastWeek = messagesAll.filter(m => {
      const d = new Date(m.dateSent);
      return d >= lastWeekStart && d <= lastWeekEnd;
    });
    const messagesThisMonth = messagesAll.filter(m => new Date(m.dateSent) >= startOfMonth);
    const messagesLastMonth = messagesAll.filter(m => {
      const d = new Date(m.dateSent);
      return d >= lastMonth && d <= endOfLastMonth;
    });

    // Filter calls by time period
    const callsToday = callsAll.filter(c => new Date(c.startTime) >= startOfDay);
    const callsYesterday = callsAll.filter(c => {
      const d = new Date(c.startTime);
      return d >= yesterday && d < startOfDay;
    });
    const callsThisWeek = callsAll.filter(c => new Date(c.startTime) >= startOfWeek);
    const callsLastWeek = callsAll.filter(c => {
      const d = new Date(c.startTime);
      return d >= lastWeekStart && d <= lastWeekEnd;
    });
    const callsThisMonth = callsAll.filter(c => new Date(c.startTime) >= startOfMonth);
    const callsLastMonth = callsAll.filter(c => {
      const d = new Date(c.startTime);
      return d >= lastMonth && d <= endOfLastMonth;
    });

    // Calculate metrics
    const outboundToday = messagesToday.filter(m => m.direction.startsWith('outbound'));
    const outboundYesterday = messagesYesterday.filter(m => m.direction.startsWith('outbound'));
    const outboundWeek = messagesThisWeek.filter(m => m.direction.startsWith('outbound'));
    const outboundLastWeek = messagesLastWeek.filter(m => m.direction.startsWith('outbound'));
    const outboundMonth = messagesThisMonth.filter(m => m.direction.startsWith('outbound'));
    const outboundLastMonth = messagesLastMonth.filter(m => m.direction.startsWith('outbound'));
    const inboundToday = messagesToday.filter(m => m.direction === 'inbound');

    const deliveredMonth = outboundMonth.filter(m => m.status === 'delivered').length;
    const failedMonth = outboundMonth.filter(m => m.status === 'failed' || m.status === 'undelivered').length;

    // Calculate usage for different periods
    const usageThisMonth = usageAll.filter(u => new Date(u.startDate) >= startOfMonth);
    const usageLastMonth = usageAll.filter(u => {
      const d = new Date(u.startDate);
      return d >= lastMonth && d <= endOfLastMonth;
    });
    const totalSpendMonth = usageThisMonth.reduce((sum, u) => sum + u.price, 0);
    const totalSpendLastMonth = usageLastMonth.reduce((sum, u) => sum + u.price, 0);
    
    const callDurationToday = callsToday.reduce((sum, c) => sum + parseInt(c.duration || '0'), 0);

    const metrics: ProviderMetrics = {
      totalMessagesSentToday: outboundToday.length,
      totalMessagesSentYesterday: outboundYesterday.length,
      totalMessagesSentThisWeek: outboundWeek.length,
      totalMessagesSentLastWeek: outboundLastWeek.length,
      totalMessagesSentThisMonth: outboundMonth.length,
      totalMessagesSentLastMonth: outboundLastMonth.length,
      totalMessagesReceivedToday: inboundToday.length,
      totalCallsToday: callsToday.length,
      totalCallsYesterday: callsYesterday.length,
      totalCallsThisWeek: callsThisWeek.length,
      totalCallsLastWeek: callsLastWeek.length,
      totalCallsThisMonth: callsThisMonth.length,
      totalCallsLastMonth: callsLastMonth.length,
      totalCallDurationToday: callDurationToday,
      totalSpendToday: 0,
      totalSpendThisWeek: 0,
      totalSpendThisMonth: totalSpendMonth,
      totalSpendLastMonth: totalSpendLastMonth,
      deliveryRate: outboundMonth.length > 0 ? (deliveredMonth / outboundMonth.length) * 100 : 100,
      failureRate: outboundMonth.length > 0 ? (failedMonth / outboundMonth.length) * 100 : 0,
    };

    return {
      account,
      phoneNumbers,
      messages: {
        today: messagesToday,
        yesterday: messagesYesterday,
        thisWeek: messagesThisWeek,
        lastWeek: messagesLastWeek,
        thisMonth: messagesThisMonth,
        lastMonth: messagesLastMonth,
        all: messagesAll, // Full 6 months for charts
      },
      calls: {
        today: callsToday,
        yesterday: callsYesterday,
        thisWeek: callsThisWeek,
        lastWeek: callsLastWeek,
        thisMonth: callsThisMonth,
        lastMonth: callsLastMonth,
        all: callsAll, // Full 6 months for charts
      },
      usage: usageAll,
      metrics,
    };
  }

  async getMetrics(): Promise<ProviderMetrics> {
    const analytics = await this.getAnalytics();
    return analytics.metrics;
  }
}
