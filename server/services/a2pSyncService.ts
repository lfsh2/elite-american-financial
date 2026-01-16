/**
 * A2P Sync Service
 * 
 * Syncs A2P 10DLC Brand and Campaign registrations from Twilio to Elite Financial.
 * This allows users to see their existing Twilio A2P compliance status.
 */

import Twilio from 'twilio';
import { db } from '../db.js';
import { storage } from '../storage';
import { A2PRegistrationStatus } from '../compliance';

// Types for Twilio A2P data
export interface TwilioBrand {
  sid: string;
  accountSid: string;
  customerProfileBundleSid: string;
  a2pProfileBundleSid: string;
  dateCreated: Date;
  dateUpdated: Date;
  brandRegistrationStatus: string;
  identityStatus: string;
  brandFeedback?: any;
  brandScore?: number;
  brandType?: string;
  mock?: boolean;
  skipAutomaticSecVet?: boolean;
  errors?: any[];
}

export interface TwilioCampaign {
  sid: string;
  accountSid: string;
  brandRegistrationSid: string;
  messagingServiceSid: string;
  description: string;
  usecase: string;
  usAppToPersonUsecase: string;
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhone: boolean;
  campaignStatus: string;
  campaignId: string;
  isExternallyRegistered: boolean;
  rateLimits?: any;
  messageFlow?: string;
  optInMessage?: string;
  optOutMessage?: string;
  helpMessage?: string;
  optInKeywords?: string[];
  optOutKeywords?: string[];
  helpKeywords?: string[];
  dateCreated: Date;
  dateUpdated: Date;
}

export interface TwilioMessagingService {
  sid: string;
  accountSid: string;
  friendlyName: string;
  dateCreated: Date;
  dateUpdated: Date;
  inboundRequestUrl?: string;
  inboundMethod?: string;
  fallbackUrl?: string;
  fallbackMethod?: string;
  statusCallback?: string;
  useInboundWebhookOnNumber?: boolean;
  areaCodeGeomatch?: boolean;
  validityPeriod?: number;
  synchronousValidation?: boolean;
  usecase?: string;
}

export interface A2PSyncResult {
  brands: {
    total: number;
    synced: number;
    items: any[];
  };
  campaigns: {
    total: number;
    synced: number;
    items: any[];
  };
  messagingServices: {
    total: number;
    synced: number;
    items: any[];
  };
}

class A2PSyncService {
  
  /**
   * Sync all A2P data from Twilio
   */
  async syncFromTwilio(userId: number): Promise<A2PSyncResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const client = Twilio(accountSid, authToken);
    const result: A2PSyncResult = {
      brands: { total: 0, synced: 0, items: [] },
      campaigns: { total: 0, synced: 0, items: [] },
      messagingServices: { total: 0, synced: 0, items: [] }
    };

    try {
      // 1. Sync Brand Registrations
      console.log('Syncing A2P Brand Registrations...');
      const brands = await this.syncBrands(client, userId);
      result.brands = brands;

      // 2. Sync Campaign Registrations
      console.log('Syncing A2P Campaign Registrations...');
      const campaigns = await this.syncCampaigns(client, userId);
      result.campaigns = campaigns;

      // 3. Sync Messaging Services
      console.log('Syncing Messaging Services...');
      const messagingServices = await this.syncMessagingServices(client, userId);
      result.messagingServices = messagingServices;

      console.log('A2P Sync completed:', result);
      return result;
    } catch (error: any) {
      console.error('Error syncing A2P data:', error);
      throw new Error(error.message || 'Failed to sync A2P data from Twilio');
    }
  }

  /**
   * Sync Brand Registrations from Twilio
   */
  private async syncBrands(client: Twilio.Twilio, userId: number) {
    const items: any[] = [];
    let total = 0;
    let synced = 0;

    try {
      // Fetch all brand registrations
      const brands = await client.messaging.v1.brandRegistrations.list();
      total = brands.length;

      console.log(`Found ${total} brand registrations in Twilio`);

      for (const brand of brands) {
        const brandData = {
          id: brand.sid,
          externalId: brand.sid,
          userId: userId,
          companyName: (brand as any).a2pProfileBundleSid || 'Unknown',
          status: this.mapBrandStatus((brand as any).status || (brand as any).brandRegistrationStatus || 'pending'),
          brandType: (brand as any).brandType || 'STANDARD',
          brandScore: (brand as any).brandScore,
          identityStatus: (brand as any).identityStatus,
          dateCreated: brand.dateCreated?.toISOString() || new Date().toISOString(),
          dateUpdated: brand.dateUpdated?.toISOString() || new Date().toISOString(),
          twilioData: {
            customerProfileBundleSid: (brand as any).customerProfileBundleSid,
            a2pProfileBundleSid: (brand as any).a2pProfileBundleSid,
            brandFeedback: (brand as any).brandFeedback,
            errors: (brand as any).errors
          }
        };

        // Save to storage
        try {
          await storage.saveA2PCompanyRegistration({
            id: brand.sid,
            userId: userId,
            companyName: brandData.companyName,
            externalId: brand.sid,
            status: brandData.status,
            dateCreated: brandData.dateCreated,
            dateUpdated: brandData.dateUpdated
          });
          synced++;
        } catch (saveError) {
          console.error(`Error saving brand ${brand.sid}:`, saveError);
        }

        items.push(brandData);
      }
    } catch (error: any) {
      // Handle case where A2P is not enabled
      if (error.code === 20003 || error.status === 403) {
        console.log('A2P Brand Registrations not accessible (may not be enabled)');
      } else {
        console.error('Error fetching brand registrations:', error);
      }
    }

    return { total, synced, items };
  }

  /**
   * Sync Campaign Registrations from Twilio
   */
  private async syncCampaigns(client: Twilio.Twilio, userId: number) {
    const items: any[] = [];
    let total = 0;
    let synced = 0;

    try {
      // Fetch all US A2P campaigns
      const campaigns = await client.messaging.v1.services.list();
      
      // For each messaging service, check for A2P campaigns
      for (const service of campaigns) {
        try {
          const usAppToPersonList = await client.messaging.v1
            .services(service.sid)
            .usAppToPerson
            .list();

          for (const campaign of usAppToPersonList) {
            total++;
            
            const campaignData = {
              id: campaign.sid,
              externalId: campaign.sid,
              userId: userId,
              campaignName: campaign.description || `Campaign ${campaign.sid}`,
              useCase: (campaign as any).usAppToPersonUsecase || (campaign as any).usecase || 'MIXED',
              description: campaign.description,
              status: this.mapCampaignStatus((campaign as any).campaignStatus || 'pending'),
              messagingServiceSid: service.sid,
              messagingServiceName: service.friendlyName,
              brandRegistrationSid: campaign.brandRegistrationSid,
              hasEmbeddedLinks: campaign.hasEmbeddedLinks,
              hasEmbeddedPhone: campaign.hasEmbeddedPhone,
              messageFlow: (campaign as any).messageFlow,
              optInMessage: (campaign as any).optInMessage,
              optOutMessage: (campaign as any).optOutMessage,
              helpMessage: (campaign as any).helpMessage,
              dateCreated: campaign.dateCreated?.toISOString() || new Date().toISOString(),
              dateUpdated: campaign.dateUpdated?.toISOString() || new Date().toISOString()
            };

            // Save to storage
            try {
              await storage.saveA2PCampaignRegistration({
                id: campaign.sid,
                userId: userId,
                companyRegistrationId: campaign.brandRegistrationSid || 'unknown',
                campaignName: campaignData.campaignName,
                useCase: campaignData.useCase,
                externalId: campaign.sid,
                status: campaignData.status,
                dateCreated: campaignData.dateCreated,
                dateUpdated: campaignData.dateUpdated
              });
              synced++;
            } catch (saveError) {
              console.error(`Error saving campaign ${campaign.sid}:`, saveError);
            }

            items.push(campaignData);
          }
        } catch (campaignError: any) {
          // Some messaging services may not have A2P campaigns
          if (campaignError.code !== 20404) {
            console.error(`Error fetching campaigns for service ${service.sid}:`, campaignError);
          }
        }
      }

      console.log(`Found ${total} A2P campaigns in Twilio`);
    } catch (error: any) {
      if (error.code === 20003 || error.status === 403) {
        console.log('A2P Campaigns not accessible (may not be enabled)');
      } else {
        console.error('Error fetching campaigns:', error);
      }
    }

    return { total, synced, items };
  }

  /**
   * Sync Messaging Services from Twilio
   */
  private async syncMessagingServices(client: Twilio.Twilio, userId: number) {
    const items: any[] = [];
    let total = 0;
    let synced = 0;

    try {
      const services = await client.messaging.v1.services.list();
      total = services.length;

      console.log(`Found ${total} messaging services in Twilio`);

      for (const service of services) {
        const serviceData = {
          sid: service.sid,
          friendlyName: service.friendlyName,
          usecase: service.usecase,
          dateCreated: service.dateCreated?.toISOString(),
          dateUpdated: service.dateUpdated?.toISOString(),
          inboundRequestUrl: service.inboundRequestUrl,
          statusCallback: service.statusCallback,
          areaCodeGeomatch: service.areaCodeGeomatch,
          validityPeriod: service.validityPeriod
        };

        items.push(serviceData);
        synced++;
      }
    } catch (error: any) {
      console.error('Error fetching messaging services:', error);
    }

    return { total, synced, items };
  }

  /**
   * Get A2P compliance summary for a user
   */
  async getComplianceSummary(userId: number): Promise<{
    hasBrandRegistration: boolean;
    brandStatus: A2PRegistrationStatus;
    brandCount: number;
    campaignCount: number;
    approvedCampaigns: number;
    pendingCampaigns: number;
    messagingServices: number;
  }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return {
        hasBrandRegistration: false,
        brandStatus: A2PRegistrationStatus.NOT_STARTED,
        brandCount: 0,
        campaignCount: 0,
        approvedCampaigns: 0,
        pendingCampaigns: 0,
        messagingServices: 0
      };
    }

    const client = Twilio(accountSid, authToken);

    let brandCount = 0;
    let brandStatus = A2PRegistrationStatus.NOT_STARTED;
    let campaignCount = 0;
    let approvedCampaigns = 0;
    let pendingCampaigns = 0;
    let messagingServices = 0;

    try {
      // Get brand registrations
      const brands = await client.messaging.v1.brandRegistrations.list();
      brandCount = brands.length;
      
      if (brands.length > 0) {
        // Use the status of the first/primary brand
        brandStatus = this.mapBrandStatus((brands[0] as any).status || (brands[0] as any).brandRegistrationStatus || 'pending');
      }

      // Get messaging services and campaigns
      const services = await client.messaging.v1.services.list();
      messagingServices = services.length;

      for (const service of services) {
        try {
          const campaigns = await client.messaging.v1
            .services(service.sid)
            .usAppToPerson
            .list();
          
          campaignCount += campaigns.length;
          
          for (const campaign of campaigns) {
            const status = this.mapCampaignStatus(campaign.campaignStatus);
            if (status === A2PRegistrationStatus.APPROVED) {
              approvedCampaigns++;
            } else if (status === A2PRegistrationStatus.PENDING) {
              pendingCampaigns++;
            }
          }
        } catch (e) {
          // Ignore errors for individual services
        }
      }
    } catch (error) {
      console.error('Error getting compliance summary:', error);
    }

    return {
      hasBrandRegistration: brandCount > 0,
      brandStatus,
      brandCount,
      campaignCount,
      approvedCampaigns,
      pendingCampaigns,
      messagingServices
    };
  }

  /**
   * Map Twilio brand status to internal status
   */
  private mapBrandStatus(twilioStatus: string): A2PRegistrationStatus {
    const status = twilioStatus?.toLowerCase() || '';
    
    switch (status) {
      case 'approved':
      case 'verified':
      case 'registered':
        return A2PRegistrationStatus.APPROVED;
      case 'pending':
      case 'in_review':
      case 'submitted':
      case 'unverified':
        return A2PRegistrationStatus.PENDING;
      case 'failed':
      case 'rejected':
      case 'denied':
        return A2PRegistrationStatus.REJECTED;
      default:
        return A2PRegistrationStatus.PENDING;
    }
  }

  /**
   * Map Twilio campaign status to internal status
   */
  private mapCampaignStatus(twilioStatus: string): A2PRegistrationStatus {
    const status = twilioStatus?.toLowerCase() || '';
    
    switch (status) {
      case 'verified':
      case 'approved':
      case 'active':
        return A2PRegistrationStatus.APPROVED;
      case 'pending':
      case 'in_progress':
      case 'submitted':
        return A2PRegistrationStatus.PENDING;
      case 'failed':
      case 'rejected':
        return A2PRegistrationStatus.REJECTED;
      default:
        return A2PRegistrationStatus.PENDING;
    }
  }
}

export const a2pSyncService = new A2PSyncService();
