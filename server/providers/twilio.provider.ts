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
    
    return numbers.map(n => ({
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
    }));
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

  async getMessages(dateRange: DateRange): Promise<Message[]> {
    const messages = await this.client.messages.list({
      dateSentAfter: dateRange.startDate,
      dateSentBefore: dateRange.endDate,
      limit: 500,
    });

    return messages.map(m => ({
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
    }));
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
        callParams.twiml = '<Response><Say>Hello from SyncGrid</Say></Response>';
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
      limit: 500,
    });

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

    // Fetch all data in parallel
    const [account, phoneNumbers, messagesMonth, callsMonth, usageMonth] = await Promise.all([
      this.getAccountInfo(),
      this.getPhoneNumbers(),
      this.getMessages({ startDate: startOfMonth, endDate: now }),
      this.getCalls({ startDate: startOfMonth, endDate: now }),
      this.getUsage({ startDate: startOfMonth, endDate: now }),
    ]);

    // Filter messages by time period
    const messagesToday = messagesMonth.filter(m => new Date(m.dateSent) >= startOfDay);
    const messagesThisWeek = messagesMonth.filter(m => new Date(m.dateSent) >= startOfWeek);

    // Filter calls by time period
    const callsToday = callsMonth.filter(c => new Date(c.startTime) >= startOfDay);
    const callsThisWeek = callsMonth.filter(c => new Date(c.startTime) >= startOfWeek);

    // Calculate metrics
    const outboundToday = messagesToday.filter(m => m.direction.startsWith('outbound'));
    const outboundWeek = messagesThisWeek.filter(m => m.direction.startsWith('outbound'));
    const outboundMonth = messagesMonth.filter(m => m.direction.startsWith('outbound'));
    const inboundToday = messagesToday.filter(m => m.direction === 'inbound');

    const deliveredMonth = outboundMonth.filter(m => m.status === 'delivered').length;
    const failedMonth = outboundMonth.filter(m => m.status === 'failed' || m.status === 'undelivered').length;

    const totalSpend = usageMonth.reduce((sum, u) => sum + u.price, 0);
    const callDurationToday = callsToday.reduce((sum, c) => sum + parseInt(c.duration || '0'), 0);

    const metrics: ProviderMetrics = {
      totalMessagesSentToday: outboundToday.length,
      totalMessagesSentThisWeek: outboundWeek.length,
      totalMessagesSentThisMonth: outboundMonth.length,
      totalMessagesReceivedToday: inboundToday.length,
      totalCallsToday: callsToday.length,
      totalCallsThisWeek: callsThisWeek.length,
      totalCallDurationToday: callDurationToday,
      totalSpendToday: 0, // Would need daily usage query
      totalSpendThisWeek: 0,
      totalSpendThisMonth: totalSpend,
      deliveryRate: outboundMonth.length > 0 ? (deliveredMonth / outboundMonth.length) * 100 : 100,
      failureRate: outboundMonth.length > 0 ? (failedMonth / outboundMonth.length) * 100 : 0,
    };

    return {
      account,
      phoneNumbers,
      messages: {
        today: messagesToday,
        thisWeek: messagesThisWeek,
        thisMonth: messagesMonth,
      },
      calls: {
        today: callsToday,
        thisWeek: callsThisWeek,
        thisMonth: callsMonth,
      },
      usage: usageMonth,
      metrics,
    };
  }

  async getMetrics(): Promise<ProviderMetrics> {
    const analytics = await this.getAnalytics();
    return analytics.metrics;
  }
}
