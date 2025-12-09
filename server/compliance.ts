// Compliance service to handle A2P 10DLC registration and other messaging regulations
import { User } from "@shared/schema";

// A2P 10DLC Campaign Registry status
export enum A2PRegistrationStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

// Company brand registration status
interface CompanyRegistration {
  id: string;
  companyName: string;
  status: A2PRegistrationStatus;
  externalId?: string; // ID from Campaign Registry
  dateCreated: string;
  dateUpdated: string;
}

// Campaign registration status
interface CampaignRegistration {
  id: string;
  companyRegistrationId: string;
  campaignName: string;
  useCase: string;
  status: A2PRegistrationStatus;
  externalId?: string; // ID from Campaign Registry
  dateCreated: string;
  dateUpdated: string;
}

// Service for handling messaging compliance requirements
export class ComplianceService {
  private companyRegistrations: Map<number, CompanyRegistration> = new Map();
  private campaignRegistrations: Map<string, CampaignRegistration> = new Map();
  private isEnabled: boolean = true;

  constructor() {
    // Check if Twilio credentials are properly configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn("Twilio credentials not fully configured. Compliance features may not work correctly.");
    }
    
    // Initialize the A2P schema synchronizer
    this.initializeA2PSchema();
  }
  
  // Initialize A2P schema synchronization
  private async initializeA2PSchema() {
    try {
      // In development mode, we'll import it only when needed
      if (process.env.NODE_ENV === 'production') {
        const { a2pSchemaSynchronizer } = await import('./a2pSchemaSynchronizer');
        a2pSchemaSynchronizer.startSyncInterval();
        console.log('A2P schema synchronization initialized');
      }
    } catch (error) {
      console.error('Failed to initialize A2P schema synchronizer:', error);
    }
  }

  // Check if a user has A2P 10DLC registration
  async hasA2PRegistration(userId: number): Promise<boolean> {
    const registration = this.companyRegistrations.get(userId);
    return registration?.status === A2PRegistrationStatus.APPROVED;
  }

  // Get the registration status for a user
  async getRegistrationStatus(userId: number): Promise<A2PRegistrationStatus> {
    const registration = this.companyRegistrations.get(userId);
    return registration?.status || A2PRegistrationStatus.NOT_STARTED;
  }

  // Start a new company registration
  async startCompanyRegistration(
    userId: number, 
    companyName: string,
    businessInfo: any
  ): Promise<CompanyRegistration> {
    console.log(`Starting company registration for ${companyName}`);
    
    try {
      // Use the A2P registration service to handle form validation and submission
      if (process.env.NODE_ENV === 'production') {
        const { a2pRegistrationService } = await import('./a2pRegistration');
        
        // Convert the data to the expected format
        const formData = {
          userId,
          companyName,
          ...businessInfo
        };
        
        // Submit the registration
        const result = await a2pRegistrationService.registerCompany(formData);
        
        if (result.success) {
          // Create the registration record
          const registration: CompanyRegistration = {
            id: result.id!,
            companyName,
            status: result.status,
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString()
          };
          
          // Save it to our local store
          this.companyRegistrations.set(userId, registration);
          return registration;
        } else {
          throw new Error(result.message || 'Registration failed');
        }
      } else {
        // For development, we simulate a registration
        const registration: CompanyRegistration = {
          id: `CR${Math.random().toString(36).substring(2, 10)}`,
          companyName,
          status: A2PRegistrationStatus.PENDING,
          dateCreated: new Date().toISOString(),
          dateUpdated: new Date().toISOString()
        };
        
        this.companyRegistrations.set(userId, registration);
        return registration;
      }
    } catch (error) {
      console.error('Company registration failed:', error);
      throw error;
    }
  }

  // Start a new campaign registration
  async startCampaignRegistration(
    userId: number,
    campaignName: string,
    useCase: string,
    campaignDetails: any = {}
  ): Promise<CampaignRegistration | null> {
    const companyRegistration = this.companyRegistrations.get(userId);
    
    if (!companyRegistration || companyRegistration.status !== A2PRegistrationStatus.APPROVED) {
      return null; // Company must be registered and approved first
    }
    
    console.log(`Starting campaign registration for: ${campaignName}, Use case: ${useCase}`);
    
    try {
      // Use the A2P registration service to handle form validation and submission
      if (process.env.NODE_ENV === 'production') {
        const { a2pRegistrationService } = await import('./a2pRegistration');
        
        // Convert the data to the expected format
        const formData = {
          userId,
          companyRegistrationId: companyRegistration.id,
          campaignName,
          useCase,
          ...campaignDetails
        };
        
        // Submit the registration
        const result = await a2pRegistrationService.registerCampaign(formData);
        
        if (result.success) {
          // Create the registration record
          const registration: CampaignRegistration = {
            id: result.id!,
            companyRegistrationId: companyRegistration.id,
            campaignName,
            useCase,
            status: result.status,
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString()
          };
          
          // Save it to our local store
          this.campaignRegistrations.set(registration.id, registration);
          return registration;
        } else {
          throw new Error(result.message || 'Campaign registration failed');
        }
      } else {
        // For development, we simulate a registration
        const registration: CampaignRegistration = {
          id: `CM${Math.random().toString(36).substring(2, 10)}`,
          companyRegistrationId: companyRegistration.id,
          campaignName,
          useCase,
          status: A2PRegistrationStatus.PENDING,
          dateCreated: new Date().toISOString(),
          dateUpdated: new Date().toISOString()
        };
        
        this.campaignRegistrations.set(registration.id, registration);
        return registration;
      }
    } catch (error) {
      console.error('Campaign registration failed:', error);
      return null;
    }
  }

  // Check if a message is compliant with regulations
  async isMessageCompliant(
    userId: number,
    message: string,
    to: string,
    from: string
  ): Promise<{ compliant: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Example compliance checks:
    
    // 1. Check if user has A2P registration for US numbers
    if (to.startsWith('+1') && !await this.hasA2PRegistration(userId)) {
      issues.push('User does not have A2P 10DLC registration for US messaging.');
    }
    
    // 2. Check for required opt-out language for commercial messages in the US
    if (to.startsWith('+1') && !message.toLowerCase().includes('stop') && !message.toLowerCase().includes('opt out')) {
      issues.push('Commercial messages in the US should include opt-out instructions.');
    }
    
    // 3. Check message length (some carriers have restrictions)
    if (message.length > 1600) {
      issues.push('Message exceeds maximum recommended length.');
    }
    
    return {
      compliant: issues.length === 0,
      issues
    };
  }

  // Check if a number requires A2P registration
  requiresA2PRegistration(phoneNumber: string): boolean {
    // US numbers require A2P 10DLC registration for business messaging
    return phoneNumber.startsWith('+1');
  }

  // Get help text for compliance issues
  getA2PRegistrationHelp(): string {
    return `A2P 10DLC registration is required for business messaging to US phone numbers. 
    
To register:
1. Complete your company profile
2. Submit for verification (typically takes 1-3 business days)
3. Once company is verified, register your messaging campaign
4. Wait for campaign approval before sending high volumes of messages

Without proper registration, messages may be filtered or blocked by carriers and you may face higher fees.`;
  }
  
  // Check and update the status of a registration
  async checkRegistrationStatus(
    userId: number, 
    registrationId: string, 
    type: 'company' | 'campaign'
  ): Promise<A2PRegistrationStatus> {
    try {
      if (process.env.NODE_ENV === 'production') {
        const { a2pRegistrationService } = await import('./a2pRegistration');
        
        // Call the registration service to check the status
        const status = await a2pRegistrationService.checkRegistrationStatus(registrationId, type);
        
        // Update the local registration record
        if (type === 'company') {
          const registration = this.companyRegistrations.get(userId);
          
          if (registration && registration.id === registrationId) {
            registration.status = status;
            registration.dateUpdated = new Date().toISOString();
            this.companyRegistrations.set(userId, registration);
          }
        } else {
          const registration = this.campaignRegistrations.get(registrationId);
          
          if (registration) {
            registration.status = status;
            registration.dateUpdated = new Date().toISOString();
            this.campaignRegistrations.set(registrationId, registration);
          }
        }
        
        return status;
      } else {
        // Simulate a status update based on ID for development
        // For development, 90% chance of going to approved if pending
        if (type === 'company') {
          const registration = this.companyRegistrations.get(userId);
          
          if (registration && registration.status === A2PRegistrationStatus.PENDING) {
            if (Math.random() < 0.9) {
              registration.status = A2PRegistrationStatus.APPROVED;
              registration.dateUpdated = new Date().toISOString();
              this.companyRegistrations.set(userId, registration);
            }
          }
          
          return registration?.status || A2PRegistrationStatus.NOT_STARTED;
        } else {
          const registration = this.campaignRegistrations.get(registrationId);
          
          if (registration && registration.status === A2PRegistrationStatus.PENDING) {
            if (Math.random() < 0.9) {
              registration.status = A2PRegistrationStatus.APPROVED;
              registration.dateUpdated = new Date().toISOString();
              this.campaignRegistrations.set(registrationId, registration);
            }
          }
          
          return registration?.status || A2PRegistrationStatus.NOT_STARTED;
        }
      }
    } catch (error) {
      console.error('Failed to check registration status:', error);
      return A2PRegistrationStatus.PENDING; // Default to pending on error
    }
  }
}

export const complianceService = new ComplianceService();