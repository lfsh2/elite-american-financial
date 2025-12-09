/**
 * A2P Translation Layer
 * 
 * This module provides translation between white-labeled terms and Twilio's terminology
 * for A2P 10DLC registration. This helps maintain the white-label nature of the application
 * while still working with Twilio's APIs behind the scenes.
 */

import { A2PFieldType } from './a2pSchemaSynchronizer';

// Field name mapping (white-labeled to Twilio)
const fieldNameMap: Record<string, string> = {
  // Company Registration
  'companyName': 'business_name',
  'taxId': 'tax_id',
  'companyWebsite': 'website',
  'businessType': 'business_type',
  'businessAddress': 'address_street',
  'businessCity': 'address_city',
  'businessState': 'address_state',
  'businessPostalCode': 'address_postal_code',
  'businessCountry': 'address_country',
  'contactFirstName': 'contact_first_name',
  'contactLastName': 'contact_last_name',
  'contactEmail': 'contact_email',
  'contactPhone': 'contact_phone',
  'authorizedSignatory': 'authorized_signatory_affirmation',
  
  // Campaign Registration
  'campaignName': 'campaign_name',
  'useCase': 'campaign_use_case',
  'messageSamples': 'sample_messages',
  'optInWorkflow': 'opt_in_process',
  'optOutInstructions': 'opt_out_instructions',
  'tcpaCompliance': 'tcpa_compliance_agreement',
  'messageFrequency': 'message_frequency'
};

// Reverse mapping (Twilio to white-labeled)
const reverseFieldNameMap: Record<string, string> = 
  Object.entries(fieldNameMap).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
  }, {} as Record<string, string>);

// Use case mapping (white-labeled to Twilio)
const useCaseMap: Record<string, string> = {
  'marketing': 'MARKETING',
  'customer_service': 'CUSTOMER_SERVICE',
  'authentication': '2FA',
  'account_notifications': 'ACCOUNT_NOTIFICATION',
  'polling_voting': 'POLLING_AND_VOTING',
  'info_on_demand': 'INFORMATION_ON_DEMAND',
  'higher_education': 'HIGHER_EDUCATION',
  'nonprofit': 'NON_PROFIT'
};

// Reverse use case mapping (Twilio to white-labeled)
const reverseUseCaseMap: Record<string, string> = 
  Object.entries(useCaseMap).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
  }, {} as Record<string, string>);

// Translate field names to Twilio's terminology
export function toTwilioFieldName(whitelabeledName: string): string {
  return fieldNameMap[whitelabeledName] || whitelabeledName;
}

// Translate field names from Twilio's terminology
export function fromTwilioFieldName(twilioName: string): string {
  return reverseFieldNameMap[twilioName] || twilioName;
}

// Translate use case to Twilio's terminology
export function toTwilioUseCase(whitelabeledUseCase: string): string {
  return useCaseMap[whitelabeledUseCase] || whitelabeledUseCase.toUpperCase();
}

// Translate use case from Twilio's terminology
export function fromTwilioUseCase(twilioUseCase: string): string {
  return reverseUseCaseMap[twilioUseCase] || twilioUseCase.toLowerCase();
}

// Process form data for submission to Twilio
export function translateFormDataToTwilio(formData: Record<string, any>): Record<string, any> {
  const twilioData: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(formData)) {
    // Skip userId and other non-field properties
    if (key === 'userId' || key === 'companyRegistrationId') {
      twilioData[key] = value;
      continue;
    }
    
    const twilioKey = toTwilioFieldName(key);
    
    // Handle special fields like useCase
    if (key === 'useCase') {
      twilioData[twilioKey] = toTwilioUseCase(value as string);
    } else {
      twilioData[twilioKey] = value;
    }
  }
  
  return twilioData;
}

// Process response data from Twilio
export function translateResponseFromTwilio(twilioData: Record<string, any>): Record<string, any> {
  const whitelabeledData: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(twilioData)) {
    const whitelabeledKey = fromTwilioFieldName(key);
    
    // Handle special fields like use_case or campaign_use_case
    if (key === 'use_case' || key === 'campaign_use_case') {
      whitelabeledData[whitelabeledKey] = fromTwilioUseCase(value as string);
    } else {
      whitelabeledData[whitelabeledKey] = value;
    }
  }
  
  return whitelabeledData;
}

// Translate error codes from Twilio
export function translateErrorCode(twilioErrorCode: string): string {
  const errorCodeMap: Record<string, string> = {
    // Standard HTTP errors
    'ValidationError.BrandRegistration.DuplicateEntry': 'DUPLICATE_REGISTRATION',
    'ValidationError.BrandRegistration.InvalidInput': 'INVALID_INPUT',
    'ValidationError.BrandRegistration.MissingRequiredField': 'MISSING_FIELD',
    'AuthenticationError': 'AUTH_ERROR',
    'RateLimitError': 'RATE_LIMIT',
    'ResourceNotFoundError': 'NOT_FOUND',
    'ServerError': 'SERVER_ERROR',
    
    // Specific TCR error codes
    'TCR-BRAND-001': 'COMPANY_NAME_REQUIRED',
    'TCR-BRAND-002': 'INVALID_TAX_ID',
    'TCR-BRAND-003': 'INVALID_WEBSITE',
    'TCR-CAMP-001': 'CAMPAIGN_NAME_REQUIRED',
    'TCR-CAMP-002': 'INVALID_USE_CASE',
    'TCR-CAMP-003': 'SAMPLE_MESSAGES_REQUIRED',
    'TCR-CAMP-004': 'OPT_IN_PROCESS_REQUIRED'
  };
  
  return errorCodeMap[twilioErrorCode] || 'UNKNOWN_ERROR';
}

// Translate friendly user-facing error messages
export function getErrorMessage(errorCode: string): string {
  const errorMessageMap: Record<string, string> = {
    // Standard error messages
    'DUPLICATE_REGISTRATION': 'This company is already registered. Please use the existing registration.',
    'INVALID_INPUT': 'Some of the information provided is invalid. Please review and correct the highlighted fields.',
    'MISSING_FIELD': 'Required information is missing. Please complete all required fields.',
    'AUTH_ERROR': 'We encountered an authentication error. Please try again later or contact support.',
    'RATE_LIMIT': 'Too many requests. Please wait a moment and try again.',
    'NOT_FOUND': 'The requested resource was not found. Please check your information and try again.',
    'SERVER_ERROR': 'We encountered an unexpected error. Please try again later or contact support.',
    
    // Specific field error messages
    'COMPANY_NAME_REQUIRED': 'Company name is required',
    'INVALID_TAX_ID': 'Tax ID is invalid. Please use the format XX-XXXXXXX',
    'INVALID_WEBSITE': 'Website must be a valid URL starting with http:// or https://',
    'CAMPAIGN_NAME_REQUIRED': 'Campaign name is required',
    'INVALID_USE_CASE': 'Please select a valid use case',
    'SAMPLE_MESSAGES_REQUIRED': 'Sample messages are required',
    'OPT_IN_PROCESS_REQUIRED': 'Opt-in process description is required',
    'UNKNOWN_ERROR': 'An error occurred with your submission. Please check all fields and try again.'
  };
  
  return errorMessageMap[errorCode] || 'An unexpected error occurred. Please try again.';
}

// Consistent terminology mapping for the UI
export const complianceTerminology = {
  title: 'SMS Compliance Center',
  subtitle: 'Manage messaging compliance requirements including business messaging registration',
  
  // Instead of "A2P 10DLC"
  registrationSystem: 'Business Messaging Registration',
  
  // Instead of "Brand"
  company: 'Company',
  companyRegistration: 'Company Registration',
  companyVerification: 'Company Verification',
  
  // Instead of "Campaign Registry"
  registryName: 'Messaging Registry',
  
  // Status names
  status: {
    notStarted: 'Not Started',
    pending: 'Pending Verification',
    approved: 'Approved',
    rejected: 'Rejected'
  },
  
  // Help text
  helpText: {
    overview: 'Business messaging registration is required for high-volume messaging to US numbers.',
    companyRegistration: 'Register your company details for verification. This is required before registering campaigns.',
    campaignRegistration: 'Register the specific messaging campaigns you plan to send.',
    approvalTime: 'Verification typically takes 1-3 business days.',
    rejectionInfo: 'If rejected, review the feedback and resubmit with corrected information.'
  }
};