// A2P Registration Service - Handles registration with the Campaign Registry via the Communications API
import axios from 'axios';
import { a2pSchemaSynchronizer, A2PFormField, A2PSchema } from './a2pSchemaSynchronizer';
import { communicationService } from './communications';
import { storage } from './storage';
import { A2PRegistrationStatus } from './compliance';
import { 
  translateFormDataToTwilio, 
  translateResponseFromTwilio, 
  translateErrorCode,
  getErrorMessage,
  fromTwilioFieldName
} from './translationLayer';

// Company Registration Form Data
export interface CompanyRegistrationFormData {
  userId: number;
  companyName: string;
  [key: string]: any; // Dynamic fields from schema
}

// Campaign Registration Form Data
export interface CampaignRegistrationFormData {
  userId: number;
  companyRegistrationId: string;
  campaignName: string;
  useCase: string;
  [key: string]: any; // Dynamic fields from schema
}

// Registration Result
export interface RegistrationResult {
  success: boolean;
  id?: string;
  status: A2PRegistrationStatus;
  message?: string;
  errors?: { field: string; message: string }[];
}

/**
 * Service for handling A2P 10DLC registrations with dynamic form validation
 */
export class A2PRegistrationService {
  constructor() {}
  
  /**
   * Get the current registration form schema
   */
  async getRegistrationFormSchema(): Promise<A2PSchema> {
    return await a2pSchemaSynchronizer.getSchema();
  }
  
  /**
   * Validate company registration form data against the current schema
   */
  async validateCompanyRegistration(formData: CompanyRegistrationFormData): Promise<{ valid: boolean; errors: { field: string; message: string }[] }> {
    const schema = await this.getRegistrationFormSchema();
    const errors: { field: string; message: string }[] = [];
    
    // Validate required fields
    for (const field of schema.brandRegistration.fields) {
      if (field.validation.required && !formData[field.name]) {
        errors.push({
          field: field.name,
          message: `${field.label} is required`
        });
        continue;
      }
      
      // Skip validation for empty optional fields
      if (!formData[field.name]) {
        continue;
      }
      
      // Validate field based on its type
      switch (field.type) {
        case 'text':
          this.validateTextField(field, formData[field.name], errors);
          break;
        case 'email':
          this.validateEmailField(field, formData[field.name], errors);
          break;
        case 'url':
          this.validateUrlField(field, formData[field.name], errors);
          break;
        case 'select':
          this.validateSelectField(field, formData[field.name], errors);
          break;
        // Additional validation methods for other field types...
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Register a company with the Campaign Registry
   */
  async registerCompany(formData: CompanyRegistrationFormData): Promise<RegistrationResult> {
    try {
      // Validate the form data
      const validation = await this.validateCompanyRegistration(formData);
      
      if (!validation.valid) {
        return {
          success: false,
          status: A2PRegistrationStatus.NOT_STARTED,
          errors: validation.errors,
          message: 'Validation failed. Please correct the errors and try again.'
        };
      }
      
      console.log(`Submitting company registration for: ${formData.companyName}`);
      
      // Get the API credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        // Fall back to development mode if credentials aren't available
        if (process.env.NODE_ENV !== 'production') {
          // Simulate a registration by generating an ID
          const registrationId = `CR${Math.random().toString(36).substring(2, 10)}`;
          
          // Store the simulated registration details
          await storage.saveA2PCompanyRegistration({
            id: registrationId,
            userId: formData.userId,
            companyName: formData.companyName,
            externalId: registrationId,
            status: A2PRegistrationStatus.PENDING,
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString()
          });
          
          return {
            success: true,
            id: registrationId,
            status: A2PRegistrationStatus.PENDING,
            message: 'Company registration submitted successfully. Verification is in progress.'
          };
        }
        
        throw new Error('Twilio API credentials are not configured. Unable to register company.');
      }
      
      // Translate form data to Twilio's expected format
      const twilioData = translateFormDataToTwilio(formData);
      
      // Log what we're sending to Twilio (with sensitive data redacted)
      const logSafeData = { ...twilioData };
      delete logSafeData.tax_id; // Redact sensitive fields
      console.log('Sending to Twilio API:', logSafeData);
      
      // Call Twilio's API to create a brand registration
      const response = await axios({
        method: 'post',
        url: `https://messaging.twilio.com/v1/a2p/brands`,
        auth: {
          username: accountSid,
          password: authToken
        },
        data: twilioData,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      // Extract the brand registration data from the response
      const brandData = response.data;
      
      if (!brandData.sid) {
        throw new Error('Invalid response from Twilio API: Missing brand SID');
      }
      
      // Store the registration details in our database
      await storage.saveA2PCompanyRegistration({
        id: brandData.sid, // Use Twilio's SID as our ID
        userId: formData.userId,
        companyName: formData.companyName,
        externalId: brandData.sid,
        status: this.mapTwilioStatusToInternal(brandData.status),
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString()
      });
      
      return {
        success: true,
        id: brandData.sid,
        status: this.mapTwilioStatusToInternal(brandData.status),
        message: 'Company registration submitted successfully. Verification is in progress.'
      };
    } catch (error) {
      console.error('Company registration failed:', error);
      
      // Handle Twilio API errors
      if (axios.isAxiosError(error) && error.response) {
        const twilioError = error.response.data;
        console.log('Twilio error response:', twilioError);
        
        // Extract field-specific errors if available
        const fieldErrors: { field: string; message: string }[] = [];
        
        if (twilioError.field_errors && Array.isArray(twilioError.field_errors)) {
          twilioError.field_errors.forEach((fieldError: any) => {
            const fieldName = fromTwilioFieldName(fieldError.field);
            fieldErrors.push({
              field: fieldName,
              message: fieldError.message || 'Invalid value'
            });
          });
        }
        
        // Parse Twilio error codes and translate them to user-friendly messages
        if (twilioError.code) {
          const errorCode = translateErrorCode(twilioError.code);
          const errorMessage = getErrorMessage(errorCode);
          
          return {
            success: false,
            status: A2PRegistrationStatus.NOT_STARTED,
            message: errorMessage,
            errors: fieldErrors.length > 0 ? fieldErrors : undefined
          };
        }
        
        // Return field-specific errors if available
        if (fieldErrors.length > 0) {
          return {
            success: false,
            status: A2PRegistrationStatus.NOT_STARTED,
            message: 'Please fix the validation errors and try again.',
            errors: fieldErrors
          };
        }
      }
      
      return {
        success: false,
        status: A2PRegistrationStatus.NOT_STARTED,
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  }
  
  /**
   * Register a campaign with the Campaign Registry
   */
  async registerCampaign(formData: CampaignRegistrationFormData): Promise<RegistrationResult> {
    try {
      // Validate that the company is already registered and approved
      if (!formData.companyRegistrationId) {
        return {
          success: false,
          status: A2PRegistrationStatus.NOT_STARTED,
          message: 'Company registration is required before registering a campaign'
        };
      }
      
      // Check company registration status
      const companyStatus = await this.checkRegistrationStatus(
        formData.companyRegistrationId, 
        'company'
      );
      
      if (companyStatus !== A2PRegistrationStatus.APPROVED) {
        return {
          success: false,
          status: A2PRegistrationStatus.NOT_STARTED,
          message: 'Company registration must be approved before registering a campaign'
        };
      }
      
      console.log(`Submitting campaign registration for: ${formData.campaignName}`);
      
      // Get the API credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        // Fall back to development mode if credentials aren't available
        if (process.env.NODE_ENV !== 'production') {
          // Simulate a registration by generating an ID
          const registrationId = `CM${Math.random().toString(36).substring(2, 10)}`;
          
          // Store the simulated registration details
          await storage.saveA2PCampaignRegistration({
            id: registrationId,
            userId: formData.userId,
            companyRegistrationId: formData.companyRegistrationId,
            campaignName: formData.campaignName,
            useCase: formData.useCase,
            externalId: registrationId,
            status: A2PRegistrationStatus.PENDING,
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString()
          });
          
          return {
            success: true,
            id: registrationId,
            status: A2PRegistrationStatus.PENDING,
            message: 'Campaign registration submitted successfully. Verification is in progress.'
          };
        }
        
        throw new Error('Communication API credentials are not configured');
      }
      
      // Translate form data to Twilio's expected format
      const twilioData = translateFormDataToTwilio({
        ...formData,
        brandSid: formData.companyRegistrationId // Twilio expects brandSid
      });
      
      // Call Twilio's API to create a campaign registration
      const response = await axios({
        method: 'post',
        url: `https://messaging.twilio.com/v1/a2p_campaigns`,
        auth: {
          username: accountSid,
          password: authToken
        },
        data: twilioData
      });
      
      // Extract the campaign registration data
      const campaignData = response.data;
      
      // Store the registration details in our database
      await storage.saveA2PCampaignRegistration({
        id: campaignData.sid, // Use Twilio's SID as our ID
        userId: formData.userId,
        companyRegistrationId: formData.companyRegistrationId,
        campaignName: formData.campaignName,
        useCase: formData.useCase,
        externalId: campaignData.sid,
        status: A2PRegistrationStatus.PENDING,
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString()
      });
      
      return {
        success: true,
        id: campaignData.sid,
        status: A2PRegistrationStatus.PENDING,
        message: 'Campaign registration submitted successfully. Verification is in progress.'
      };
    } catch (error) {
      console.error('Campaign registration failed:', error);
      
      // Handle Twilio API errors
      if (axios.isAxiosError(error) && error.response) {
        const twilioError = error.response.data;
        
        // Parse Twilio error codes and translate them to user-friendly messages
        if (twilioError.code) {
          const errorCode = translateErrorCode(twilioError.code);
          const errorMessage = getErrorMessage(errorCode);
          
          return {
            success: false,
            status: A2PRegistrationStatus.NOT_STARTED,
            message: errorMessage
          };
        }
      }
      
      return {
        success: false,
        status: A2PRegistrationStatus.NOT_STARTED,
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  }
  
  /**
   * Helper method to map Twilio status to our internal status enum
   */
  private mapTwilioStatusToInternal(twilioStatus: string): A2PRegistrationStatus {
    const status = twilioStatus?.toLowerCase() || '';
    
    switch (status) {
      case 'approved':
      case 'active':
      case 'complete':
      case 'verified':
        return A2PRegistrationStatus.APPROVED;
      case 'pending':
      case 'in_review':
      case 'submitted':
      case 'in progress':
      case 'awaiting_review':
        return A2PRegistrationStatus.PENDING;
      case 'rejected':
      case 'failed':
      case 'denied':
        return A2PRegistrationStatus.REJECTED;
      default:
        return A2PRegistrationStatus.PENDING;
    }
  }
  
  /**
   * Check registration status
   */
  async checkRegistrationStatus(registrationId: string, type: 'company' | 'campaign'): Promise<A2PRegistrationStatus> {
    try {
      // Get the API credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        // Fall back to development mode if credentials aren't available
        if (process.env.NODE_ENV !== 'production') {
          // Simulate a status based on the registration ID for development
          const rand = Math.random();
          if (rand < 0.8) {
            return A2PRegistrationStatus.APPROVED;
          } else if (rand < 0.9) {
            return A2PRegistrationStatus.PENDING;
          } else {
            return A2PRegistrationStatus.REJECTED;
          }
        }
        
        throw new Error('Communication API credentials are not configured');
      }
      
      // Determine API endpoint based on registration type
      let endpoint: string;
      if (type === 'company') {
        endpoint = `https://messaging.twilio.com/v1/a2p_brand_registrations/${registrationId}`;
      } else {
        endpoint = `https://messaging.twilio.com/v1/a2p_campaigns/${registrationId}`;
      }
      
      // Call Twilio's API to check registration status
      const response = await axios({
        method: 'get',
        url: endpoint,
        auth: {
          username: accountSid,
          password: authToken
        }
      });
      
      // Extract the status from the response
      const data = response.data;
      const twilioStatus = data.status.toLowerCase();
      
      // Map Twilio status to our status enum
      switch (twilioStatus) {
        case 'approved':
        case 'active':
          return A2PRegistrationStatus.APPROVED;
        case 'pending':
        case 'in_review':
        case 'submitted':
          return A2PRegistrationStatus.PENDING;
        case 'rejected':
        case 'failed':
          return A2PRegistrationStatus.REJECTED;
        default:
          return A2PRegistrationStatus.PENDING;
      }
    } catch (error) {
      console.error(`Failed to check ${type} registration status:`, error);
      
      // For development, return a default status
      if (process.env.NODE_ENV !== 'production') {
        return A2PRegistrationStatus.PENDING;
      }
      
      // In production, rethrow the error
      throw error;
    }
  }
  
  /**
   * Validate a text field
   */
  private validateTextField(field: A2PFormField, value: string, errors: { field: string; message: string }[]): void {
    if (field.validation.minLength && value.length < field.validation.minLength) {
      errors.push({
        field: field.name,
        message: `${field.label} must be at least ${field.validation.minLength} characters`
      });
    }
    
    if (field.validation.maxLength && value.length > field.validation.maxLength) {
      errors.push({
        field: field.name,
        message: `${field.label} must be no more than ${field.validation.maxLength} characters`
      });
    }
    
    if (field.validation.pattern && !new RegExp(field.validation.pattern).test(value)) {
      errors.push({
        field: field.name,
        message: `${field.label} has an invalid format`
      });
    }
  }
  
  /**
   * Validate an email field
   */
  private validateEmailField(field: A2PFormField, value: string, errors: { field: string; message: string }[]): void {
    // Simple email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({
        field: field.name,
        message: `${field.label} must be a valid email address`
      });
    }
  }
  
  /**
   * Validate a URL field
   */
  private validateUrlField(field: A2PFormField, value: string, errors: { field: string; message: string }[]): void {
    try {
      new URL(value);
    } catch (e) {
      errors.push({
        field: field.name,
        message: `${field.label} must be a valid URL`
      });
    }
  }
  
  /**
   * Validate a select field
   */
  private validateSelectField(field: A2PFormField, value: string, errors: { field: string; message: string }[]): void {
    if (field.validation.options && !field.validation.options.includes(value)) {
      errors.push({
        field: field.name,
        message: `${field.label} must be one of the allowed options`
      });
    }
  }
}

// Create and export the registration service instance
export const a2pRegistrationService = new A2PRegistrationService();