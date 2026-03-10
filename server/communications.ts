import { SmsMessage, VoiceCall } from "@shared/schema";
import twilio from 'twilio';

// Interface for phone number data
interface PhoneNumber {
  id: string;
  userId: number;
  phoneNumber: string; 
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  status: string;
  type: string;
  countryCode: string;
  monthlyPrice: number;
  dateCreated: string;
}

// Interface for available phone numbers from search
interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  locality: string;
  region: string;
  countryCode: string;
  monthlyPrice: number;
}

// Service for interacting with communication APIs
export class CommunicationService {
  private apiKey: string;
  private apiSecret: string;
  private accountSid: string;
  private phoneNumbers: string[];
  private client: twilio.Twilio | null = null;
  private isConfigured: boolean = false;

  constructor() {
    // Use Twilio credentials from environment variables
    this.apiKey = process.env.TWILIO_API_KEY || "";
    this.apiSecret = process.env.TWILIO_API_SECRET || "";
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.phoneNumbers = process.env.TWILIO_PHONE_NUMBERS?.split(',') || [];
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    
    // Check if Twilio API credentials are properly configured
    if (!this.accountSid || !authToken || this.phoneNumbers.length === 0) {
      console.warn("Twilio API credentials not properly configured. Using simulation mode.");
      this.isConfigured = false;
    } else {
      try {
        // Initialize Twilio client with the account SID and auth token
        if (this.apiKey && this.apiSecret) {
          // If API key/secret are provided, use those (preferred for security)
          this.client = twilio(this.apiKey, this.apiSecret, { 
            accountSid: this.accountSid,
            region: 'us1'  // Default to us1 region, can be configured if needed
          });
        } else {
          // Otherwise use the account SID and auth token
          this.client = twilio(this.accountSid, authToken);
        }
        
        this.isConfigured = true;
        console.log("Twilio communication service initialized successfully.");
      } catch (error) {
        console.error("Failed to initialize Twilio client:", error);
        this.isConfigured = false;
      }
    }
  }

  // SMS Methods
  async sendSMS(to: string, from: string, body: string, mediaUrls?: string[]): Promise<{ 
    success: boolean; 
    sid?: string; 
    error?: string;
    price?: string;
    priceUnit?: string;
    numSegments?: string;
  }> {
    try {
      console.log(`Sending SMS from ${from} to ${to}: ${body}`);
      
      // If Twilio client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated SMS sending (Twilio service not configured)");
        return {
          success: true,
          sid: `SM${Math.random().toString(36).substring(2, 15)}`
        };
      }
      
      // Use Twilio API to send real messages
      if (this.client) {
        const messageOptions: any = {
          body,
          from,
          to
        };
        
        // Add media URLs if provided
        if (mediaUrls && mediaUrls.length > 0) {
          messageOptions.mediaUrl = mediaUrls;
        }
        
        const message = await this.client.messages.create(messageOptions);
        
        return {
          success: true,
          sid: message.sid,
          price: message.price || undefined,
          priceUnit: message.priceUnit || undefined,
          numSegments: message.numSegments || undefined,
        };
      } else {
        throw new Error("Communication service client not initialized");
      }
    } catch (error) {
      console.error("Failed to send SMS:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async getSmsStatus(sid: string): Promise<string> {
    try {
      // If communication client is not configured, use simulation
      if (!this.isConfigured || !this.client) {
        console.log("Using simulated SMS status (Communication service not configured)");
        return Math.random() > 0.9 ? 'failed' : 'delivered';
      }
      
      // Use Communication API to get real message status
      const message = await this.client.messages(sid).fetch();
      return message.status;
    } catch (error) {
      console.error("Failed to get SMS status:", error);
      return 'unknown';
    }
  }

  // Voice Methods
  async initiateCall(to: string, from: string): Promise<{
    success: boolean;
    sid?: string;
    error?: string;
  }> {
    try {
      console.log(`Initiating call from ${from} to ${to}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated call initiation (Communication service not configured)");
        return {
          success: true,
          sid: `CA${Math.random().toString(36).substring(2, 15)}`
        };
      }
      
      // Use Communication API to initiate real call
      if (this.client) {
        // In a production environment, you would typically use TwiML for more complex calls
        // For simple calls, we can use the Calls resource
        
        // Call options - for simple calls without TwiML
        const callOptions = {
          to,
          from,
          url: process.env.CALL_URL || 'https://api.textflow.ai/voice/default.xml', // Default voice XML
        };
        
        const call = await this.client.calls.create(callOptions);
        
        return {
          success: true,
          sid: call.sid
        };
      } else {
        throw new Error("Communication service client not initialized");
      }
    } catch (error) {
      console.error("Failed to initiate call:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async getCallStatus(sid: string): Promise<string> {
    try {
      // If communication client is not configured, use simulation
      if (!this.isConfigured || !this.client) {
        console.log("Using simulated call status (Communication service not configured)");
        const statuses = ['in-progress', 'completed', 'no-answer', 'failed'];
        return statuses[Math.floor(Math.random() * statuses.length)];
      }
      
      // Use Communication API to get real call status
      const call = await this.client.calls(sid).fetch();
      return call.status;
    } catch (error) {
      console.error("Failed to get call status:", error);
      return 'unknown';
    }
  }

  // Phone Number Management Methods
  
  // Get all phone numbers for a user
  async getPhoneNumbers(userId: number): Promise<PhoneNumber[]> {
    try {
      console.log(`Getting phone numbers for user ${userId}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated phone numbers (Communication service not configured)");
        
        // Return mock phone numbers in development
        return this.phoneNumbers.map((phoneNumber, index) => ({
          id: `PN${Math.random().toString(36).substring(2, 10)}`,
          userId,
          phoneNumber,
          friendlyName: `Line ${index + 1}`,
          capabilities: {
            voice: true,
            sms: true,
            mms: true
          },
          status: 'active',
          type: 'local',
          countryCode: 'US',
          monthlyPrice: 1.0,
          dateCreated: new Date().toISOString()
        }));
      }
      
      // Use Communication API to get real phone numbers
      if (this.client) {
        const incomingNumbers = await this.client.incomingPhoneNumbers.list();
        
        // Map API response to our interface
        return incomingNumbers.map(number => ({
          id: number.sid,
          userId, // We don't store user association in the API, so we use the provided userId
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName,
          capabilities: {
            voice: number.capabilities.voice || false,
            sms: number.capabilities.sms || false,
            mms: number.capabilities.mms || false
          },
          status: 'active', // API doesn't have a direct "status" property like this
          type: number.phoneNumber.startsWith('+1800') ? 'tollfree' : 'local',
          countryCode: 'US', // This would need more logic for international numbers
          monthlyPrice: 1.0, // This isn't directly available from the API
          dateCreated: number.dateCreated.toISOString()
        }));
      }
      
      return [];
    } catch (error) {
      console.error("Failed to get phone numbers:", error);
      return [];
    }
  }

  // Search for available phone numbers
  async searchPhoneNumbers(
    countryCode = 'US',
    areaCode?: string,
    contains?: string,
    type = 'local',
    capabilities?: { voice?: boolean, sms?: boolean, mms?: boolean }
  ): Promise<AvailablePhoneNumber[]> {
    try {
      console.log(`Searching for ${type} phone numbers in ${countryCode} ${areaCode ? `area code ${areaCode}` : ''} ${contains ? `containing ${contains}` : ''}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated available phone numbers (Communication service not configured)");
        
        // Return mock available phone numbers
        return Array.from({ length: 5 }).map(() => {
          const areaCodePrefix = areaCode ? areaCode : Math.floor(Math.random() * 800 + 200).toString();
          const phoneNumber = `+1${areaCodePrefix}${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
          
          return {
            phoneNumber,
            friendlyName: phoneNumber,
            capabilities: {
              voice: capabilities?.voice !== false,
              sms: capabilities?.sms !== false, 
              mms: capabilities?.mms !== false
            },
            locality: 'New York',
            region: 'NY',
            countryCode,
            monthlyPrice: type === 'tollfree' ? 2.0 : 1.0
          };
        });
      }
      
      // Use Communication API to search for real available phone numbers
      if (this.client) {
        let searchParams: any = {};
        
        if (areaCode) {
          searchParams.areaCode = areaCode;
        }
        
        if (contains) {
          searchParams.contains = contains;
        }
        
        if (capabilities?.voice) {
          searchParams.voiceEnabled = true;
        }
        
        if (capabilities?.sms) {
          searchParams.smsEnabled = true;
        }
        
        if (capabilities?.mms) {
          searchParams.mmsEnabled = true;
        }
        
        // Get available phone numbers from communication API
        let availableNumbers;
        if (type === 'tollfree') {
          availableNumbers = await this.client.availablePhoneNumbers(countryCode).tollFree.list(searchParams);
        } else {
          availableNumbers = await this.client.availablePhoneNumbers(countryCode).local.list(searchParams);
        }
        
        // Map API response to our interface
        return availableNumbers.map(number => ({
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName || number.phoneNumber,
          capabilities: {
            voice: number.capabilities.voice || false,
            sms: number.capabilities.sms || false,
            mms: number.capabilities.mms || false
          },
          locality: number.locality || '',
          region: number.region || '',
          countryCode: number.isoCountry || countryCode,
          monthlyPrice: type === 'tollfree' ? 2.0 : 1.0 // Pricing isn't directly available from the API
        }));
      }
      
      return [];
    } catch (error) {
      console.error("Failed to search phone numbers:", error);
      return [];
    }
  }

  // Purchase a phone number
  async purchasePhoneNumber(
    userId: number,
    phoneNumber: string,
    friendlyName?: string
  ): Promise<PhoneNumber> {
    try {
      console.log(`Purchasing phone number ${phoneNumber} for user ${userId}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated phone number purchase (Communication service not configured)");
        
        // Return a mock purchased phone number
        return {
          id: `PN${Math.random().toString(36).substring(2, 10)}`,
          userId,
          phoneNumber,
          friendlyName: friendlyName || phoneNumber,
          capabilities: {
            voice: true,
            sms: true,
            mms: true
          },
          status: 'active',
          type: phoneNumber.startsWith('+1800') ? 'tollfree' : 'local',
          countryCode: 'US',
          monthlyPrice: phoneNumber.startsWith('+1800') ? 2.0 : 1.0,
          dateCreated: new Date().toISOString()
        };
      }
      
      // Use Communication API to purchase a real phone number
      if (this.client) {
        const purchaseParams: any = {
          phoneNumber,
          friendlyName: friendlyName || phoneNumber,
        };
        
        const incomingNumber = await this.client.incomingPhoneNumbers.create(purchaseParams);
        
        // Map API response to our interface
        return {
          id: incomingNumber.sid,
          userId,
          phoneNumber: incomingNumber.phoneNumber,
          friendlyName: incomingNumber.friendlyName,
          capabilities: {
            voice: incomingNumber.capabilities.voice || false,
            sms: incomingNumber.capabilities.sms || false,
            mms: incomingNumber.capabilities.mms || false
          },
          status: 'active',
          type: incomingNumber.phoneNumber.startsWith('+1800') ? 'tollfree' : 'local',
          countryCode: 'US',
          monthlyPrice: incomingNumber.phoneNumber.startsWith('+1800') ? 2.0 : 1.0,
          dateCreated: incomingNumber.dateCreated.toISOString()
        };
      }
      
      throw new Error("Communication service client not initialized");
    } catch (error) {
      console.error("Failed to purchase phone number:", error);
      throw error;
    }
  }

  // Release (delete) a phone number
  async releasePhoneNumber(phoneNumberId: string, userId: number): Promise<{ success: boolean, message?: string }> {
    try {
      console.log(`Releasing phone number ${phoneNumberId} for user ${userId}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated phone number release (Communication service not configured)");
        
        // Return a successful response
        return {
          success: true,
          message: 'Phone number released successfully'
        };
      }
      
      // Use Communication API to release a real phone number
      if (this.client) {
        await this.client.incomingPhoneNumbers(phoneNumberId).remove();
        
        return {
          success: true,
          message: 'Phone number released successfully'
        };
      }
      
      throw new Error("Communication service client not initialized");
    } catch (error) {
      console.error("Failed to release phone number:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // Update a phone number's settings
  async updatePhoneNumber(
    id: string,
    userId: number,
    friendlyName?: string,
    settings?: any
  ): Promise<{ success: boolean, id: string, userId: number, friendlyName?: string, settings?: any }> {
    try {
      console.log(`Updating phone number ${id} for user ${userId}`);
      
      // If communication client is not configured or we're in development mode without configs, use simulation
      if (!this.isConfigured || (process.env.NODE_ENV === 'development' && !this.client)) {
        console.log("Using simulated phone number update (Communication service not configured)");
        
        // Return a successful response
        return {
          success: true,
          id,
          userId,
          friendlyName: friendlyName || `Updated Number`,
          settings
        };
      }
      
      // Use Communication API to update a real phone number
      if (this.client) {
        const updateParams: any = {};
        
        if (friendlyName) {
          updateParams.friendlyName = friendlyName;
        }
        
        if (settings) {
          // Map our settings object to communication API-specific settings
          if (settings.smsUrl) {
            updateParams.smsUrl = settings.smsUrl;
          }
          
          if (settings.voiceUrl) {
            updateParams.voiceUrl = settings.voiceUrl;
          }
          
          // Add other settings mappings as needed
        }
        
        // Only update if we have parameters to update
        if (Object.keys(updateParams).length > 0) {
          await this.client.incomingPhoneNumbers(id).update(updateParams);
        }
        
        return {
          success: true,
          id,
          userId,
          friendlyName,
          settings
        };
      }
      
      throw new Error("Communication service client not initialized");
    } catch (error) {
      console.error("Failed to update phone number:", error);
      return {
        success: false,
        id,
        userId
      };
    }
  }

  // Generate mock data for testing
  generateMockSmsMessage(userId: number): Partial<SmsMessage> {
    const directions = ['inbound', 'outbound'];
    const statuses = ['delivered', 'sent', 'failed', 'received'];
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const fromNumber = direction === 'inbound' 
      ? `+1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`
      : this.phoneNumbers[Math.floor(Math.random() * this.phoneNumbers.length)] || '+18005551234';
    
    const toNumber = direction === 'outbound'
      ? `+1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`
      : this.phoneNumbers[Math.floor(Math.random() * this.phoneNumbers.length)] || '+18005551234';
      
    const sampleMessages = [
      "Hi there! Just checking in on your order.",
      "Your appointment is confirmed for tomorrow at 3PM.",
      "Thanks for your payment. Your receipt has been sent to your email.",
      "Your package has been delivered. Thank you for shopping with us!",
      "Would you like to schedule a follow-up consultation?",
      "This is a reminder about your upcoming appointment.",
      "Reply YES to confirm your subscription.",
      "Your verification code is 123456.",
      "We've received your feedback. Thank you!"
    ];
    
    const message = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
    
    return {
      userId,
      to: toNumber,
      from: fromNumber,
      body: message,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      direction,
      mediaUrls: Math.random() > 0.8 ? ["https://textflow.ai/example-media.jpg"] : [],
      messageSid: `SM${Math.random().toString(36).substring(2, 15)}`
    };
  }

  generateMockVoiceCall(userId: number): Partial<VoiceCall> {
    const directions = ['inbound', 'outbound'];
    const statuses = ['completed', 'no-answer', 'busy', 'failed', 'in-progress'];
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const fromNumber = direction === 'inbound' 
      ? `+1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`
      : this.phoneNumbers[Math.floor(Math.random() * this.phoneNumbers.length)] || '+18005551234';
    
    const toNumber = direction === 'outbound'
      ? `+1${Math.floor(Math.random() * 1000000000).toString().padStart(10, '0')}`
      : this.phoneNumbers[Math.floor(Math.random() * this.phoneNumbers.length)] || '+18005551234';
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const duration = status === 'completed' ? Math.floor(Math.random() * 600) : undefined;
    const recordingUrl = status === 'completed' && Math.random() > 0.7 
      ? `https://api.textflow.ai/recordings/RE${Math.random().toString(36).substring(2, 15)}.mp3` 
      : undefined;
    
    return {
      userId,
      to: toNumber,
      from: fromNumber,
      status,
      direction,
      duration,
      recordingUrl,
      callSid: `CA${Math.random().toString(36).substring(2, 15)}`
    };
  }
}

export const communicationService = new CommunicationService();