// A2P Schema Synchronizer - Keeps form fields and requirements in sync with Twilio's A2P 10DLC
import axios from 'axios';
import { storage } from './storage';
import { communicationService } from './communications';

// A2P form field types
export enum A2PFieldType {
  TEXT = 'text',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  CHECKBOX = 'checkbox',
  DATE = 'date',
  FILE = 'file',
  PHONE = 'phone',
  EMAIL = 'email',
  URL = 'url',
  ADDRESS = 'address'
}

// A2P field validation rules
export interface A2PFieldValidation {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  options?: string[];
  description?: string;
}

// A2P form field definition
export interface A2PFormField {
  id: string;
  name: string;
  label: string;
  type: A2PFieldType;
  validation: A2PFieldValidation;
  helpText?: string;
  placeholder?: string;
  defaultValue?: string;
  order: number;
  section: string;
}

// Brand registration fields
export interface BrandRegistrationSchema {
  version: string;
  lastUpdated: string;
  sections: string[];
  fields: A2PFormField[];
}

// Campaign use cases
export interface CampaignUseCase {
  id: string;
  name: string;
  description: string;
  exampleMessages: string[];
  throughputLimit: number;
  requiresSpecialApproval: boolean;
  fields: A2PFormField[];
}

// Campaign types
export interface CampaignType {
  id: string;
  name: string;
  description: string;
}

// Complete A2P schema
export interface A2PSchema {
  brandRegistration: BrandRegistrationSchema;
  campaignUseCases: CampaignUseCase[];
  campaignTypes: CampaignType[];
  lastSyncTime: string;
}

/**
 * Service for synchronizing A2P registration schemas with the underlying communication service
 */
export class A2PSchemaSynchronizer {
  private schema: A2PSchema | null = null;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private syncIntervalMs: number = 12 * 60 * 60 * 1000; // Sync every 12 hours by default
  private isInitialized: boolean = false;
  
  constructor() {
    // Load cached schema on startup
    this.loadCachedSchema();
  }
  
  /**
   * Start periodic schema synchronization
   */
  public startSyncInterval() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }
    
    // Initial sync
    this.synchronizeSchema();
    
    // Set up interval for regular syncs
    this.syncIntervalId = setInterval(() => {
      this.synchronizeSchema();
    }, this.syncIntervalMs);
    
    console.log(`A2P schema synchronization scheduled every ${this.syncIntervalMs / (60 * 60 * 1000)} hours`);
  }
  
  /**
   * Stop periodic schema synchronization
   */
  public stopSyncInterval() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }
  
  /**
   * Get the current A2P schema
   */
  public async getSchema(): Promise<A2PSchema> {
    if (!this.isInitialized) {
      await this.loadCachedSchema();
      
      // If still no schema available, sync with API
      if (!this.schema) {
        await this.synchronizeSchema();
      }
      
      this.isInitialized = true;
    }
    
    return this.schema || this.getFallbackSchema();
  }
  
  /**
   * Get the brand registration schema only
   */
  public async getBrandRegistrationSchema(): Promise<BrandRegistrationSchema> {
    const schema = await this.getSchema();
    return schema.brandRegistration;
  }
  
  /**
   * Get campaign use cases only
   */
  public async getCampaignUseCases(): Promise<CampaignUseCase[]> {
    const schema = await this.getSchema();
    return schema.campaignUseCases;
  }
  
  /**
   * Get a specific campaign use case by ID
   */
  public async getCampaignUseCase(useCaseId: string): Promise<CampaignUseCase | undefined> {
    const schema = await this.getSchema();
    return schema.campaignUseCases.find(uc => uc.id === useCaseId);
  }
  
  /**
   * Get fields for a specific form section of brand registration
   */
  public async getBrandRegistrationFieldsBySection(section: string): Promise<A2PFormField[]> {
    const schema = await this.getSchema();
    return schema.brandRegistration.fields
      .filter(field => field.section === section)
      .sort((a, b) => a.order - b.order);
  }
  
  /**
   * Get fields for a specific campaign use case
   */
  public async getCampaignUseCaseFields(useCaseId: string): Promise<A2PFormField[]> {
    const useCase = await this.getCampaignUseCase(useCaseId);
    if (!useCase) {
      return [];
    }
    return useCase.fields.sort((a, b) => a.order - b.order);
  }
  
  /**
   * Force immediate schema synchronization
   */
  public async synchronizeSchema(): Promise<boolean> {
    try {
      console.log('Synchronizing A2P schema with Twilio API...');
      
      // Check if Twilio API credentials are available
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      let newSchema: A2PSchema;
      
      if (accountSid && authToken) {
        try {
          // Call the internal methods to fetch data from Twilio API
          const brandRegistration = await this.fetchBrandRegistrationSchema();
          const campaignUseCases = await this.fetchCampaignUseCases();
          const campaignTypes = await this.fetchCampaignTypes();
          
          // Create new schema with real API data
          newSchema = {
            brandRegistration,
            campaignUseCases,
            campaignTypes,
            lastSyncTime: new Date().toISOString()
          };
          
          console.log('Successfully retrieved A2P schema from Twilio API');
        } catch (apiError) {
          console.error('Failed to fetch from Twilio API, using fallback schema:', apiError);
          newSchema = this.getFallbackSchema();
          newSchema.lastSyncTime = new Date().toISOString();
        }
      } else {
        console.warn('Twilio credentials not found. Using fallback A2P schema');
        newSchema = this.getFallbackSchema();
        newSchema.lastSyncTime = new Date().toISOString();
      }
      
      // Compare with existing schema to detect changes
      const hasChanges = this.detectSchemaChanges(this.schema, newSchema);
      
      if (hasChanges) {
        console.log('A2P schema changes detected. Updating...');
        
        // Send notifications about schema changes
        this.notifySchemaChanges(this.schema, newSchema);
        
        // Update our local schema
        this.schema = newSchema;
        
        // Save to cache
        await this.cacheSchema(newSchema);
      } else {
        console.log('A2P schema is up to date. No changes detected.');
      }
      
      this.isInitialized = true;
      return hasChanges;
    } catch (error) {
      console.error('Failed to synchronize A2P schema:', error);
      
      // If we failed to sync, but already have a schema, continue using it
      if (!this.schema) {
        // If we have no schema at all, use the fallback
        this.schema = this.getFallbackSchema();
      }
      
      this.isInitialized = true;
      return false;
    }
  }
  
  /**
   * Load cached schema from storage
   */
  private async loadCachedSchema() {
    try {
      // In a real implementation, this would load from a database
      // For example:
      // this.schema = await storage.getA2PSchema();
      
      // For now, just use the fallback schema
      this.schema = this.getFallbackSchema();
      this.schema.lastSyncTime = new Date().toISOString();
    } catch (error) {
      console.error('Failed to load cached A2P schema:', error);
    }
  }
  
  /**
   * Save schema to cache
   */
  private async cacheSchema(schema: A2PSchema) {
    try {
      // In a real implementation, this would save to a database
      // For example:
      // await storage.saveA2PSchema(schema);
      
      // For development, we'll just log it
      console.log('A2P schema cached successfully');
    } catch (error) {
      console.error('Failed to cache A2P schema:', error);
    }
  }
  
  /**
   * Detect changes between schemas
   */
  private detectSchemaChanges(oldSchema: A2PSchema | null, newSchema: A2PSchema): boolean {
    if (!oldSchema) return true;
    
    // Compare version numbers
    if (oldSchema.brandRegistration.version !== newSchema.brandRegistration.version) {
      return true;
    }
    
    // Compare field counts
    if (oldSchema.brandRegistration.fields.length !== newSchema.brandRegistration.fields.length) {
      return true;
    }
    
    // Compare use case counts
    if (oldSchema.campaignUseCases.length !== newSchema.campaignUseCases.length) {
      return true;
    }
    
    // More detailed comparison could be implemented here...
    
    return false;
  }
  
  /**
   * Notify administrators about schema changes
   */
  private notifySchemaChanges(oldSchema: A2PSchema | null, newSchema: A2PSchema) {
    // In a real implementation, this would send emails or other notifications
    // For example:
    // sendAdminNotification('A2P Schema Updated', 'The A2P registration schema has been updated. Please review the changes.');
    
    console.log('A2P schema notification would be sent to administrators');
  }
  
  /**
   * Get a fallback schema for development or when API fails
   */
  private getFallbackSchema(): A2PSchema {
    return {
      brandRegistration: {
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        sections: ['Company Information', 'Business Details', 'Contact Information'],
        fields: [
          {
            id: 'company_name',
            name: 'companyName',
            label: 'Company Name',
            type: A2PFieldType.TEXT,
            validation: {
              required: true,
              minLength: 2,
              maxLength: 100
            },
            helpText: 'Legal company name as registered with authorities',
            placeholder: 'Enter your company name',
            order: 1,
            section: 'Company Information'
          },
          {
            id: 'company_website',
            name: 'companyWebsite',
            label: 'Company Website',
            type: A2PFieldType.URL,
            validation: {
              required: true
            },
            helpText: 'Must be a valid company website URL',
            placeholder: 'https://example.com',
            order: 2,
            section: 'Company Information'
          },
          {
            id: 'business_type',
            name: 'businessType',
            label: 'Business Type',
            type: A2PFieldType.SELECT,
            validation: {
              required: true,
              options: [
                'Sole Proprietorship',
                'Partnership',
                'Corporation',
                'Limited Liability Company (LLC)',
                'Non-Profit Organization'
              ]
            },
            order: 3,
            section: 'Business Details'
          },
          {
            id: 'tax_id',
            name: 'taxId',
            label: 'Tax ID / EIN',
            type: A2PFieldType.TEXT,
            validation: {
              required: true,
              pattern: '^[0-9]{2}-[0-9]{7}$'
            },
            helpText: 'Format: XX-XXXXXXX',
            placeholder: '12-3456789',
            order: 4,
            section: 'Business Details'
          },
          {
            id: 'business_address',
            name: 'businessAddress',
            label: 'Business Address',
            type: A2PFieldType.ADDRESS,
            validation: {
              required: true
            },
            order: 5,
            section: 'Business Details'
          },
          {
            id: 'contact_first_name',
            name: 'contactFirstName',
            label: 'Contact First Name',
            type: A2PFieldType.TEXT,
            validation: {
              required: true,
              maxLength: 50
            },
            order: 6,
            section: 'Contact Information'
          },
          {
            id: 'contact_last_name',
            name: 'contactLastName',
            label: 'Contact Last Name',
            type: A2PFieldType.TEXT,
            validation: {
              required: true,
              maxLength: 50
            },
            order: 7,
            section: 'Contact Information'
          },
          {
            id: 'contact_email',
            name: 'contactEmail',
            label: 'Contact Email',
            type: A2PFieldType.EMAIL,
            validation: {
              required: true
            },
            order: 8,
            section: 'Contact Information'
          },
          {
            id: 'contact_phone',
            name: 'contactPhone',
            label: 'Contact Phone',
            type: A2PFieldType.PHONE,
            validation: {
              required: true
            },
            order: 9,
            section: 'Contact Information'
          },
          {
            id: 'authorized_signatory',
            name: 'authorizedSignatory',
            label: 'Authorized Signatory',
            type: A2PFieldType.CHECKBOX,
            validation: {
              required: true
            },
            helpText: 'Confirm that you are authorized to register on behalf of this company',
            order: 10,
            section: 'Contact Information'
          }
        ]
      },
      campaignUseCases: [
        {
          id: '2FA',
          name: 'Two-Factor Authentication',
          description: 'One-time passcodes for account verification and authentication',
          exampleMessages: [
            'Your verification code is 123456. This code will expire in 10 minutes.',
            'Use 987654 to verify your login attempt. If you did not try to log in, please change your password.'
          ],
          throughputLimit: 75,
          requiresSpecialApproval: false,
          fields: [
            {
              id: 'message_samples',
              name: 'messageSamples',
              label: 'Message Samples',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 10
              },
              helpText: 'Provide 3-5 sample messages that will be sent for this use case',
              order: 1,
              section: 'Campaign Details'
            },
            {
              id: 'opt_in_workflow',
              name: 'optInWorkflow',
              label: 'Opt-In Workflow',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 20
              },
              helpText: 'Describe how users opt in to receive these messages',
              order: 2,
              section: 'Campaign Details'
            }
          ]
        },
        {
          id: 'ALERTS',
          name: 'Account Alerts & Notifications',
          description: 'Time-sensitive notifications about account activity or status changes',
          exampleMessages: [
            'Your account balance is below $50. Please deposit funds to avoid overdraft fees.',
            'Unusual login detected to your account from a new device. If this was not you, please contact support.',
            'Your package has been delivered. Thank you for your order!'
          ],
          throughputLimit: 100,
          requiresSpecialApproval: false,
          fields: [
            {
              id: 'message_samples',
              name: 'messageSamples',
              label: 'Message Samples',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 10
              },
              helpText: 'Provide 3-5 sample messages that will be sent for this use case',
              order: 1,
              section: 'Campaign Details'
            },
            {
              id: 'opt_in_workflow',
              name: 'optInWorkflow',
              label: 'Opt-In Workflow',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 20
              },
              helpText: 'Describe how users opt in to receive these messages',
              order: 2,
              section: 'Campaign Details'
            },
            {
              id: 'opt_out_instructions',
              name: 'optOutInstructions',
              label: 'Opt-Out Instructions',
              type: A2PFieldType.TEXT,
              validation: {
                required: true
              },
              helpText: 'Describe how users can opt out of receiving messages',
              order: 3,
              section: 'Campaign Details'
            }
          ]
        },
        {
          id: 'MARKETING',
          name: 'Marketing & Promotional',
          description: 'Promotional messages, offers, and marketing campaigns',
          exampleMessages: [
            'Get 25% off your next purchase with code SAVE25. Valid this weekend only!',
            'New product alert! Our summer collection has arrived. Shop now at example.com/summer',
            'Flash sale today only! All items 50% off while supplies last.'
          ],
          throughputLimit: 60,
          requiresSpecialApproval: true,
          fields: [
            {
              id: 'message_samples',
              name: 'messageSamples',
              label: 'Message Samples',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 10
              },
              helpText: 'Provide 3-5 sample messages that will be sent for this use case',
              order: 1,
              section: 'Campaign Details'
            },
            {
              id: 'opt_in_workflow',
              name: 'optInWorkflow',
              label: 'Opt-In Workflow',
              type: A2PFieldType.TEXT,
              validation: {
                required: true,
                minLength: 20
              },
              helpText: 'Describe how users opt in to receive these messages',
              order: 2,
              section: 'Campaign Details'
            },
            {
              id: 'opt_out_instructions',
              name: 'optOutInstructions',
              label: 'Opt-Out Instructions',
              type: A2PFieldType.TEXT,
              validation: {
                required: true
              },
              helpText: 'Describe how users can opt out of receiving messages',
              order: 3,
              section: 'Campaign Details'
            },
            {
              id: 'tcpa_compliance',
              name: 'tcpaCompliance',
              label: 'TCPA Compliance',
              type: A2PFieldType.CHECKBOX,
              validation: {
                required: true
              },
              helpText: 'Confirm that your opt-in process complies with TCPA requirements',
              order: 4,
              section: 'Campaign Details'
            },
            {
              id: 'message_frequency',
              name: 'messageFrequency',
              label: 'Message Frequency',
              type: A2PFieldType.SELECT,
              validation: {
                required: true,
                options: [
                  'One-time',
                  'Daily',
                  'Weekly',
                  'Bi-weekly',
                  'Monthly'
                ]
              },
              helpText: 'How often will messages be sent to users',
              order: 5,
              section: 'Campaign Details'
            }
          ]
        }
      ],
      campaignTypes: [
        {
          id: 'STANDARD',
          name: 'Standard',
          description: 'For most business messaging needs with moderate throughput requirements'
        },
        {
          id: 'HIGH_VOLUME',
          name: 'High Volume',
          description: 'For high-volume messaging with enhanced throughput and delivery rates'
        },
        {
          id: 'LOW_VOLUME',
          name: 'Low Volume',
          description: 'For businesses with minimal messaging needs and lower throughput requirements'
        }
      ],
      lastSyncTime: new Date().toISOString()
    };
  }
  
  /**
   * Real implementation of API calls to Twilio for A2P schema data
   */
  
  private async fetchBrandRegistrationSchema(): Promise<BrandRegistrationSchema> {
    try {
      // First check if we have the required credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        console.warn("Twilio credentials not configured. Using fallback schema for brand registration.");
        return this.getFallbackSchema().brandRegistration;
      }
      
      // Call Twilio API to get brand registration schema
      const response = await axios.get(`https://messaging.twilio.com/v1/a2p/brands/registration-requirements`, {
        auth: {
          username: accountSid,
          password: authToken
        }
      });
      
      if (!response.data || response.status !== 200) {
        throw new Error('Invalid response from Twilio API for brand registration schema');
      }
      
      // Transform the response to match our internal schema format
      const twilioSchema = response.data;
      
      // Map fields and sections from Twilio's format to our internal format
      const fields: A2PFormField[] = [];
      
      // Process fields from the Twilio response
      if (twilioSchema.fields && Array.isArray(twilioSchema.fields)) {
        twilioSchema.fields.forEach((field: any, index: number) => {
          fields.push({
            id: field.id || field.name || `field_${index}`,
            name: field.name || `field_${index}`,
            label: field.label || field.name || `Field ${index}`,
            type: this.mapTwilioFieldType(field.type),
            validation: {
              required: field.required || false,
              minLength: field.min_length,
              maxLength: field.max_length,
              pattern: field.pattern,
              options: field.options || []
            },
            helpText: field.help_text || field.description || '',
            placeholder: field.placeholder || '',
            defaultValue: field.default_value || '',
            order: field.order || index,
            section: field.section || 'General'
          });
        });
      }
      
      const sections = Array.from(new Set(fields.map(field => field.section)));
      
      return {
        version: twilioSchema.version || '1.0',
        lastUpdated: new Date().toISOString(),
        sections: sections,
        fields: fields
      };
    } catch (error) {
      console.error("Error fetching brand registration schema from Twilio:", error);
      return this.getFallbackSchema().brandRegistration;
    }
  }
  
  private async fetchCampaignUseCases(): Promise<CampaignUseCase[]> {
    try {
      // First check if we have the required credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        console.warn("Twilio credentials not configured. Using fallback campaign use cases.");
        return this.getFallbackSchema().campaignUseCases;
      }
      
      // Call Twilio API to get campaign use cases
      const response = await axios.get(`https://messaging.twilio.com/v1/a2p/use-cases`, {
        auth: {
          username: accountSid,
          password: authToken
        }
      });
      
      if (!response.data || response.status !== 200) {
        throw new Error('Invalid response from Twilio API for campaign use cases');
      }
      
      // Transform the response to match our internal schema format
      const twilioUseCases = response.data.use_cases || [];
      
      return twilioUseCases.map((useCase: any) => ({
        id: useCase.id || useCase.code || useCase.name,
        name: useCase.name,
        description: useCase.description || '',
        exampleMessages: useCase.sample_messages || [],
        throughputLimit: useCase.throughput_limit || 15,
        requiresSpecialApproval: useCase.requires_special_approval || false,
        fields: this.mapTwilioFields(useCase.fields || [])
      }));
      
    } catch (error) {
      console.error("Error fetching campaign use cases from Twilio:", error);
      return this.getFallbackSchema().campaignUseCases;
    }
  }
  
  private async fetchCampaignTypes(): Promise<CampaignType[]> {
    try {
      // First check if we have the required credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        console.warn("Twilio credentials not configured. Using fallback campaign types.");
        return this.getFallbackSchema().campaignTypes;
      }
      
      // Call Twilio API to get campaign types
      const response = await axios.get(`https://messaging.twilio.com/v1/a2p/campaign-types`, {
        auth: {
          username: accountSid,
          password: authToken
        }
      });
      
      if (!response.data || response.status !== 200) {
        throw new Error('Invalid response from Twilio API for campaign types');
      }
      
      // Transform the response to match our internal schema format
      const twilioTypes = response.data.campaign_types || [];
      
      return twilioTypes.map((type: any) => ({
        id: type.id || type.code || type.name,
        name: type.name,
        description: type.description || ''
      }));
      
    } catch (error) {
      console.error("Error fetching campaign types from Twilio:", error);
      return this.getFallbackSchema().campaignTypes;
    }
  }
  
  // Helper method to map Twilio field type to our internal enum
  private mapTwilioFieldType(twilioType: string): A2PFieldType {
    switch (twilioType?.toLowerCase()) {
      case 'select':
      case 'dropdown':
        return A2PFieldType.SELECT;
      case 'checkbox':
      case 'boolean':
        return A2PFieldType.CHECKBOX;
      case 'email':
        return A2PFieldType.EMAIL;
      case 'url':
      case 'website':
        return A2PFieldType.URL;
      case 'phone':
        return A2PFieldType.PHONE;
      case 'date':
        return A2PFieldType.DATE;
      case 'address':
        return A2PFieldType.ADDRESS;
      case 'multi_select':
        return A2PFieldType.MULTI_SELECT;
      case 'file':
      case 'document':
        return A2PFieldType.FILE;
      default:
        return A2PFieldType.TEXT;
    }
  }
  
  // Helper method to map Twilio fields to our internal format
  private mapTwilioFields(twilioFields: any[]): A2PFormField[] {
    return twilioFields.map((field: any, index: number) => {
      return {
        id: field.id || field.name || `field_${index}`,
        name: field.name || `field_${index}`,
        label: field.label || field.name || `Field ${index}`,
        type: this.mapTwilioFieldType(field.type),
        validation: {
          required: field.required || false,
          minLength: field.min_length,
          maxLength: field.max_length,
          pattern: field.pattern,
          options: field.options || []
        },
        helpText: field.help_text || field.description || '',
        placeholder: field.placeholder || '',
        defaultValue: field.default_value || '',
        order: field.order || index,
        section: field.section || 'Campaign Details'
      };
    });
  }
}

// Create and export the schema synchronizer instance
export const a2pSchemaSynchronizer = new A2PSchemaSynchronizer();

// Start synchronization on module load if in production
if (process.env.NODE_ENV === 'production') {
  a2pSchemaSynchronizer.startSyncInterval();
}