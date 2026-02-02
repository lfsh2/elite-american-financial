/**
 * Commio Provider Implementation
 * 
 * Implements the ICommunicationProvider interface for Commio.
 * 
 * Note: This is a scaffold implementation. Actual Commio API integration
 * would require their SDK or REST API calls.
 */

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

export class CommioProvider implements ICommunicationProvider {
  readonly code: ProviderCode = 'commio';
  readonly name = 'Commio';
  
  private accountId: string;
  private apiToken: string;
  private username: string;
  private baseUrl = 'https://api.thinq.com';

  constructor(credentials: ProviderCredentials) {
    // Commio credentials:
    // accountSid -> Account ID (e.g., 22956)
    // authToken -> API Token (from Dashboard → API → Tokens)
    // apiKey -> Username for Basic Auth (e.g., amuniz1) - optional, defaults to accountSid
    this.accountId = credentials.accountSid;
    this.apiToken = credentials.authToken;
    this.username = credentials.apiKey || credentials.accountSid;
  }

  /**
   * Helper method for making API requests to Commio/ThinQ
   * ThinQ API uses Basic Auth with username:api_token
   * Endpoint format: /account/{account_id}/product/origination/...
   */
  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}/account/${this.accountId}${endpoint}`;
    
    // Use Basic Auth with username:token
    const basicAuth = Buffer.from(`${this.username}:${this.apiToken}`).toString('base64');
    
    console.log(`[Commio] API Request: ${method} ${url}`);
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Commio] API Error: ${response.status} - ${error}`);
      throw new Error(`Commio API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`[Commio] API Response:`, JSON.stringify(data).substring(0, 200));
    return data;
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async validateCredentials(): Promise<boolean> {
    // Just verify credentials are provided
    // Actual API validation will happen when making real calls
    if (!this.accountId || !this.apiToken) {
      console.log('Commio: Missing credentials');
      return false;
    }
    
    console.log('Commio: Credentials provided, accepting');
    return true;
  }

  async getAccountInfo(): Promise<AccountInfo> {
    try {
      const account = await this.apiRequest<any>('GET', '');
      return {
        sid: account.id || this.accountId,
        friendlyName: account.name || account.company_name || 'Commio Account',
        status: account.status || 'active',
        type: 'Full',
        dateCreated: account.created_at || new Date().toISOString(),
        dateUpdated: account.updated_at || new Date().toISOString(),
      };
    } catch {
      // Return mock data for demo
      return {
        sid: this.accountId,
        friendlyName: 'Commio Account',
        status: 'active',
        type: 'Full',
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString(),
      };
    }
  }

  // ============================================
  // PHONE NUMBERS
  // ============================================

  async getPhoneNumbers(): Promise<PhoneNumber[]> {
    // ThinQ API endpoints to try for phone numbers
    const endpoints = [
      '/product/origination/did/list',
      '/product/origination/did',
      '/origination/did/list',
      '/origination/did',
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`[Commio] Trying endpoint: ${endpoint}`);
        const response = await this.apiRequest<any>('GET', endpoint);
        
        // Response structure: { rows: [...], total: number } or array directly
        const numbers = response.rows || response.data || response.dids || response || [];
        const numberList = Array.isArray(numbers) ? numbers : [];
        
        if (numberList.length > 0) {
          console.log(`[Commio] Fetched ${numberList.length} phone numbers from ${endpoint}`);
          
          return numberList.map((n: any) => ({
            sid: n.id || n.did_id || n.did || n.phone_number,
            phoneNumber: this.formatPhoneNumber(n.did || n.phone_number || n.number),
            friendlyName: n.friendly_name || n.name || n.did || n.phone_number,
            capabilities: {
              sms: n.sms_enabled ?? n.features?.sms ?? true,
              voice: n.voice_enabled ?? n.features?.voice ?? true,
              mms: n.mms_enabled ?? n.features?.mms ?? false,
            },
            status: n.status || 'active',
            monthlyCost: n.monthly_cost || n.price,
            dateCreated: n.created_at || n.purchase_date || new Date().toISOString(),
          }));
        }
      } catch (error: any) {
        console.log(`[Commio] Endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }
    
    console.error('[Commio] All phone number endpoints failed');
    return [];
  }
  
  private formatPhoneNumber(number: string): string {
    if (!number) return '';
    // Add + prefix if not present and number is 10+ digits
    const cleaned = number.replace(/\D/g, '');
    if (cleaned.length >= 10 && !number.startsWith('+')) {
      return `+${cleaned.length === 10 ? '1' : ''}${cleaned}`;
    }
    return number;
  }

  async searchAvailableNumbers(options: PurchaseNumberOptions): Promise<PhoneNumber[]> {
    try {
      const params = new URLSearchParams();
      if (options.areaCode) params.set('area_code', options.areaCode);
      if (options.contains) params.set('contains', options.contains);
      
      const numbers = await this.apiRequest<any[]>('GET', `/phone-numbers/available?${params}`);
      return numbers.map(n => ({
        sid: '',
        phoneNumber: n.phone_number,
        friendlyName: n.phone_number,
        capabilities: {
          sms: n.sms_enabled ?? true,
          voice: n.voice_enabled ?? true,
          mms: n.mms_enabled ?? false,
        },
        status: 'pending',
        monthlyCost: n.monthly_cost,
        dateCreated: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async purchaseNumber(phoneNumber: string): Promise<PhoneNumber> {
    const result = await this.apiRequest<any>('POST', '/phone-numbers', {
      phone_number: phoneNumber,
    });

    return {
      sid: result.id,
      phoneNumber: result.phone_number,
      friendlyName: result.friendly_name || phoneNumber,
      capabilities: {
        sms: result.sms_enabled ?? true,
        voice: result.voice_enabled ?? true,
        mms: result.mms_enabled ?? false,
      },
      status: 'active',
      dateCreated: result.created_at || new Date().toISOString(),
    };
  }

  async releaseNumber(phoneNumber: string): Promise<boolean> {
    try {
      await this.apiRequest('DELETE', `/phone-numbers/${encodeURIComponent(phoneNumber)}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // MESSAGING
  // ============================================

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    try {
      // ThinQ SMS API endpoint: /account/{account_id}/product/origination/sms/send
      const result = await this.apiRequest<any>('POST', '/product/origination/sms/send', {
        from_did: options.from.replace(/^\+/, ''), // Remove + prefix
        to_did: options.to.replace(/^\+/, ''), // Remove + prefix
        message: options.body,
      });

      return {
        success: true,
        sid: result.guid || result.id || result.message_id,
        status: result.status || 'queued',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send message',
      };
    }
  }

  async getMessages(dateRange: DateRange): Promise<Message[]> {
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate.toISOString(),
        end_date: dateRange.endDate.toISOString(),
      });

      const messages = await this.apiRequest<any[]>('GET', `/messages?${params}`);
      
      return messages.map(m => ({
        sid: m.id,
        from: m.from,
        to: m.to,
        body: m.body,
        status: m.status,
        direction: m.direction,
        dateSent: m.sent_at || m.created_at,
        dateCreated: m.created_at,
        price: m.price?.toString(),
        priceUnit: 'USD',
      }));
    } catch {
      return [];
    }
  }

  async getMessage(sid: string): Promise<Message | null> {
    try {
      const m = await this.apiRequest<any>('GET', `/messages/${sid}`);
      return {
        sid: m.id,
        from: m.from,
        to: m.to,
        body: m.body,
        status: m.status,
        direction: m.direction,
        dateSent: m.sent_at || m.created_at,
        dateCreated: m.created_at,
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
      const result = await this.apiRequest<any>('POST', '/calls', {
        to: options.to,
        from: options.from,
        url: options.url,
      });

      return {
        success: true,
        sid: result.id,
        status: result.status || 'queued',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to make call',
      };
    }
  }

  async getCalls(dateRange: DateRange): Promise<Call[]> {
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate.toISOString(),
        end_date: dateRange.endDate.toISOString(),
      });

      const calls = await this.apiRequest<any[]>('GET', `/calls?${params}`);
      
      return calls.map(c => ({
        sid: c.id,
        from: c.from,
        to: c.to,
        status: c.status,
        direction: c.direction,
        duration: c.duration?.toString() || '0',
        startTime: c.start_time || c.created_at,
        endTime: c.end_time,
        price: c.price?.toString(),
        priceUnit: 'USD',
      }));
    } catch {
      return [];
    }
  }

  async getCall(sid: string): Promise<Call | null> {
    try {
      const c = await this.apiRequest<any>('GET', `/calls/${sid}`);
      return {
        sid: c.id,
        from: c.from,
        to: c.to,
        status: c.status,
        direction: c.direction,
        duration: c.duration?.toString() || '0',
        startTime: c.start_time || c.created_at,
        endTime: c.end_time,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // USAGE & ANALYTICS
  // ============================================

  async getUsage(dateRange: DateRange): Promise<UsageRecord[]> {
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate.toISOString(),
        end_date: dateRange.endDate.toISOString(),
      });

      const usage = await this.apiRequest<any[]>('GET', `/usage?${params}`);
      
      return usage.map(u => ({
        category: u.category,
        description: u.description,
        count: u.count || 0,
        countUnit: u.count_unit || 'messages',
        price: u.price || 0,
        priceUnit: u.price_unit || 'USD',
        startDate: u.start_date,
        endDate: u.end_date,
      }));
    } catch {
      return [];
    }
  }

  async getAnalytics(): Promise<ProviderAnalytics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Fetch last 6 months for historical charts
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const yesterday = new Date(startOfDay);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(startOfWeek);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    // Fetch all data in parallel - 6 months for historical charts
    const [account, phoneNumbers, messagesAll, callsAll, usageAll] = await Promise.all([
      this.getAccountInfo(),
      this.getPhoneNumbers(),
      this.getMessages({ startDate: sixMonthsAgo, endDate: now }),
      this.getCalls({ startDate: sixMonthsAgo, endDate: now }),
      this.getUsage({ startDate: sixMonthsAgo, endDate: now }),
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

    const usageThisMonth = usageAll.filter(u => new Date(u.startDate) >= startOfMonth);
    const totalSpendMonth = usageThisMonth.reduce((sum, u) => sum + u.price, 0);
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
        all: messagesAll,
      },
      calls: {
        today: callsToday,
        yesterday: callsYesterday,
        thisWeek: callsThisWeek,
        lastWeek: callsLastWeek,
        thisMonth: callsThisMonth,
        lastMonth: callsLastMonth,
        all: callsAll,
      },
      usage: usageAll,
      metrics,
    };
  }

  async getMetrics(): Promise<ProviderMetrics> {
    const analytics = await this.getAnalytics();
    return analytics.metrics;
  }

  /**
   * Get SMS delivery reports from Commio/ThinQ API
   * ThinQ API endpoint: /account/{account_id}/product/origination/sms/report
   */
  async getSmsReports(options?: { 
    startDate?: Date; 
    endDate?: Date; 
    limit?: number;
    page?: number;
  }): Promise<{
    messages: Array<{
      guid: string;
      from: string;
      to: string;
      status: string;
      direction: string;
      timestamp: string;
      error_code?: string;
      error_message?: string;
    }>;
    total: number;
    sent: number;
    delivered: number;
    failed: number;
  }> {
    const endpoints = [
      '/product/origination/sms/report',
      '/product/origination/sms/list',
      '/product/origination/sms/history',
      '/origination/sms/report',
    ];

    for (const endpoint of endpoints) {
      try {
        const params = new URLSearchParams();
        if (options?.startDate) params.set('start_date', options.startDate.toISOString().split('T')[0]);
        if (options?.endDate) params.set('end_date', options.endDate.toISOString().split('T')[0]);
        if (options?.limit) params.set('limit', options.limit.toString());
        if (options?.page) params.set('page', options.page.toString());

        const queryString = params.toString() ? `?${params.toString()}` : '';
        console.log(`[Commio] Fetching SMS reports from: ${endpoint}${queryString}`);
        
        const response = await this.apiRequest<any>('GET', `${endpoint}${queryString}`);
        
        // Parse response - ThinQ may return different structures
        const messages = response.rows || response.data || response.messages || response || [];
        const messageList = Array.isArray(messages) ? messages : [];
        
        // Calculate stats
        let sent = 0, delivered = 0, failed = 0;
        const formattedMessages = messageList.map((m: any) => {
          const status = (m.status || m.delivery_status || 'unknown').toLowerCase();
          
          if (status === 'delivered' || status === 'sent' || status === 'accepted') {
            delivered++;
            sent++;
          } else if (status === 'failed' || status === 'undelivered' || status === 'rejected') {
            failed++;
            sent++;
          } else if (status === 'queued' || status === 'sending') {
            sent++;
          }
          
          return {
            guid: m.guid || m.id || m.message_id,
            from: m.from_did || m.from || m.source,
            to: m.to_did || m.to || m.destination,
            status: status,
            direction: m.direction || 'outbound',
            timestamp: m.timestamp || m.created_at || m.sent_at,
            error_code: m.error_code,
            error_message: m.error_message || m.error,
          };
        });

        console.log(`[Commio] Found ${messageList.length} messages: ${sent} sent, ${delivered} delivered, ${failed} failed`);
        
        return {
          messages: formattedMessages,
          total: response.total || messageList.length,
          sent,
          delivered,
          failed,
        };
      } catch (error: any) {
        console.log(`[Commio] Endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }

    console.error('[Commio] All SMS report endpoints failed');
    return { messages: [], total: 0, sent: 0, delivered: 0, failed: 0 };
  }

  /**
   * Get SMS usage/billing data from Commio/ThinQ API
   * This fetches the outbound SMS quantity from the billing endpoint
   */
  async getSmsUsage(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    outbound: number;
    inbound: number;
    total: number;
    cost: number;
  }> {
    const endpoints = [
      '/billing/usage',
      '/billing/sms',
      '/usage/sms',
      '/product/origination/sms/usage',
      '/origination/sms/usage',
      '/account/usage',
      '/usage',
    ];

    for (const endpoint of endpoints) {
      try {
        const params = new URLSearchParams();
        if (options?.startDate) params.set('start_date', options.startDate.toISOString().split('T')[0]);
        if (options?.endDate) params.set('end_date', options.endDate.toISOString().split('T')[0]);

        const queryString = params.toString() ? `?${params.toString()}` : '';
        console.log(`[Commio] Fetching SMS usage from: ${endpoint}${queryString}`);
        
        const response = await this.apiRequest<any>('GET', `${endpoint}${queryString}`);
        
        // Parse response - look for SMS outbound usage
        let outbound = 0, inbound = 0, cost = 0;
        
        // Try different response structures
        if (response.sms_outbound !== undefined) {
          outbound = response.sms_outbound;
          inbound = response.sms_inbound || 0;
          cost = response.sms_cost || response.cost || 0;
        } else if (response.messaging?.outbound !== undefined) {
          outbound = response.messaging.outbound;
          inbound = response.messaging.inbound || 0;
          cost = response.messaging.cost || 0;
        } else if (response.usage?.sms !== undefined) {
          outbound = response.usage.sms.outbound || response.usage.sms.sent || 0;
          inbound = response.usage.sms.inbound || response.usage.sms.received || 0;
          cost = response.usage.sms.cost || 0;
        } else if (Array.isArray(response)) {
          // Array of usage records
          for (const record of response) {
            if (record.type === 'sms_outbound' || record.item?.includes('Outbound')) {
              outbound += record.quantity || record.count || 0;
              cost += record.cost || record.amount || 0;
            } else if (record.type === 'sms_inbound' || record.item?.includes('Inbound')) {
              inbound += record.quantity || record.count || 0;
            }
          }
        } else if (response.rows && Array.isArray(response.rows)) {
          for (const record of response.rows) {
            if (record.type === 'sms_outbound' || record.item?.includes('Outbound')) {
              outbound += record.quantity || record.count || 0;
              cost += record.cost || record.amount || 0;
            }
          }
        } else {
          // Try to find any numeric value that could be the count
          outbound = response.quantity || response.count || response.total || response.sent || 0;
          cost = response.cost || response.amount || response.total_cost || 0;
        }

        console.log(`[Commio] SMS Usage: outbound=${outbound}, inbound=${inbound}, cost=${cost}`);
        
        return {
          outbound,
          inbound,
          total: outbound + inbound,
          cost,
        };
      } catch (error: any) {
        console.log(`[Commio] Endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }

    console.error('[Commio] All SMS usage endpoints failed');
    return { outbound: 0, inbound: 0, total: 0, cost: 0 };
  }
}
