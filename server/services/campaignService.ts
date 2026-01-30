/**
 * Campaign Service
 * 
 * Handles brand registration, messaging campaigns, contact management,
 * and SMS campaign sending with support for Twilio and Commio providers.
 */

import { db } from '../db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  brandRegistrations,
  messagingCampaigns,
  contactLists,
  contactListMembers,
  contacts,
  smsCampaigns,
  campaignRecipients,
  optOutList,
  accounts,
  providers,
  InsertBrandRegistration,
  InsertMessagingCampaign,
  InsertContactList,
  InsertSmsCampaign,
  InsertCampaignRecipient,
  BrandRegistration,
  MessagingCampaign,
  SmsCampaign,
  Contact,
} from '../../shared/schema';
import { providerFactory } from '../providers/index.js';
import type { ProviderCode } from '../providers/types.js';

// ============================================
// CONTACT MANAGEMENT
// ============================================

export interface ContactImportRow {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

export interface ContactImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails: { row: number; error: string }[];
}

/**
 * Import contacts from CSV data
 */
export async function importContacts(
  userId: number,
  accountId: number | null,
  contactListId: number | null,
  rows: ContactImportRow[]
): Promise<ContactImportResult> {
  const result: ContactImportResult = {
    success: true,
    totalRows: rows.length,
    imported: 0,
    duplicates: 0,
    errors: 0,
    errorDetails: [],
  };

  // Validate and normalize all contacts upfront
  const validContacts: Array<{ row: ContactImportRow; phone: string; index: number }> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    if (!row.phoneNumber || !isValidPhoneNumber(row.phoneNumber)) {
      result.errors++;
      result.errorDetails.push({ row: i + 1, error: 'Invalid phone number' });
      continue;
    }
    
    const normalizedPhone = normalizePhoneNumber(row.phoneNumber);
    validContacts.push({ row, phone: normalizedPhone, index: i });
  }

  if (validContacts.length === 0) {
    return result;
  }

  // BATCH QUERY: Check all existing contacts in ONE query
  const phoneNumbers = validContacts.map(c => c.phone);
  const existingContacts = await db
    .select()
    .from(contacts)
    .where(and(
      eq(contacts.userId, userId),
      inArray(contacts.phoneNumber, phoneNumbers)
    ));

  const existingMap = new Map(existingContacts.map(c => [c.phoneNumber, c]));

  // Separate into updates and inserts
  const toUpdate: Array<{ id: number; data: any }> = [];
  const toInsert: any[] = [];
  const contactPhoneMap = new Map<string, number>(); // phone -> contactId

  for (const { row, phone } of validContacts) {
    const existing = existingMap.get(phone);
    
    if (existing) {
      toUpdate.push({
        id: existing.id,
        data: {
          firstName: row.firstName || existing.firstName,
          lastName: row.lastName || existing.lastName,
          email: row.email || existing.email,
          tags: row.tags || existing.tags,
        }
      });
      contactPhoneMap.set(phone, existing.id);
      result.duplicates++;
    } else {
      toInsert.push({
        userId,
        phoneNumber: phone,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        tags: row.tags,
        createdAt: new Date(),
      });
    }
  }

  // BATCH INSERT: Insert all new contacts at once
  if (toInsert.length > 0) {
    try {
      const insertedContacts = await db
        .insert(contacts)
        .values(toInsert)
        .returning();
      
      insertedContacts.forEach(contact => {
        contactPhoneMap.set(contact.phoneNumber, contact.id);
      });
      
      result.imported = insertedContacts.length;
    } catch (error: any) {
      console.error('Batch insert error:', error);
      result.errors += toInsert.length;
    }
  }

  // BATCH UPDATE: Update existing contacts in transaction
  if (toUpdate.length > 0) {
    try {
      await db.transaction(async (tx) => {
        for (const { id, data } of toUpdate) {
          await tx.update(contacts).set(data).where(eq(contacts.id, id));
        }
      });
    } catch (error: any) {
      console.error('Batch update error:', error);
    }
  }

  // Add to contact list if specified
  if (contactListId && contactPhoneMap.size > 0) {
    try {
      const allContactIds = Array.from(contactPhoneMap.values());
      console.log('[Import] Adding contacts to list - contactListId:', contactListId, 'contactCount:', allContactIds.length);

      // BATCH QUERY: Check existing memberships
      const existingMembers = await db
        .select()
        .from(contactListMembers)
        .where(and(
          eq(contactListMembers.contactListId, contactListId),
          inArray(contactListMembers.contactId, allContactIds)
        ));

      const existingMemberIds = new Set(existingMembers.map(m => m.contactId));
      console.log('[Import] Existing members:', existingMemberIds.size);

      // BATCH INSERT: Add new memberships
      const newMemberships = allContactIds
        .filter(id => !existingMemberIds.has(id))
        .map(contactId => ({ contactListId, contactId }));

      console.log('[Import] New memberships to add:', newMemberships.length);
      if (newMemberships.length > 0) {
        await db.insert(contactListMembers).values(newMemberships);
        console.log('[Import] Successfully added memberships');
      }
    } catch (error: any) {
      console.error('[Import] Contact list membership error:', error);
    }
  }

  // Update contact list count
  if (contactListId) {
    await updateContactListCount(contactListId);
  }

  return result;
}

/**
 * Create a new contact list
 */
export async function createContactList(
  userId: number,
  accountId: number | null,
  name: string,
  description?: string
): Promise<{ id: number }> {
  const [list] = await db
    .insert(contactLists)
    .values({
      userId,
      accountId,
      name,
      description,
    })
    .returning();

  return { id: list.id };
}

/**
 * Update contact list count
 */
async function updateContactListCount(contactListId: number): Promise<void> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactListMembers)
    .where(eq(contactListMembers.contactListId, contactListId));

  await db
    .update(contactLists)
    .set({ contactCount: result.count, updatedAt: new Date() })
    .where(eq(contactLists.id, contactListId));
}

/**
 * Delete a contact list and all its members
 */
export async function deleteContactList(
  userId: number,
  contactListId: number
): Promise<void> {
  // Verify the list belongs to the user
  const [list] = await db
    .select()
    .from(contactLists)
    .where(and(eq(contactLists.id, contactListId), eq(contactLists.userId, userId)));

  if (!list) {
    throw new Error("Contact list not found or access denied");
  }

  // Delete all members first
  await db
    .delete(contactListMembers)
    .where(eq(contactListMembers.contactListId, contactListId));

  // Delete the list
  await db
    .delete(contactLists)
    .where(eq(contactLists.id, contactListId));
}

// ============================================
// BRAND REGISTRATION
// ============================================

export interface BrandRegistrationData {
  accountId: number;
  userId: number;
  companyName: string;
  ein?: string;
  businessType: string;
  vertical: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  websiteUrl?: string;
}

/**
 * Create a brand registration (draft)
 */
export async function createBrandRegistration(
  data: BrandRegistrationData
): Promise<BrandRegistration> {
  const [brand] = await db
    .insert(brandRegistrations)
    .values({
      ...data,
      status: 'draft',
    })
    .returning();

  return brand;
}

/**
 * Submit brand registration to provider (Twilio/Commio)
 */
export async function submitBrandRegistration(
  brandId: number
): Promise<{ success: boolean; message: string; externalId?: string }> {
  const [brand] = await db
    .select()
    .from(brandRegistrations)
    .where(eq(brandRegistrations.id, brandId));

  if (!brand) {
    return { success: false, message: 'Brand registration not found' };
  }

  // Get the account and provider
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, brand.accountId));

  if (!account || !account.accountSid || !account.authToken) {
    return { success: false, message: 'Account credentials not configured' };
  }

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, account.providerId));

  if (!provider) {
    return { success: false, message: 'Provider not found' };
  }

  try {
    // Create provider instance
    const providerInstance = providerFactory.create({
      code: provider.code as ProviderCode,
      credentials: {
        accountSid: account.accountSid,
        authToken: account.authToken,
      },
      accountId: account.id,
    });

    // For Twilio, we need to use their A2P Brand Registration API
    if (provider.code === 'twilio') {
      const result = await submitTwilioBrand(brand, account);
      
      if (result.success) {
        await db
          .update(brandRegistrations)
          .set({
            status: 'pending',
            providerBrandSid: result.brandSid,
            externalBrandId: result.brandSid,
            submittedAt: new Date(),
            updatedAt: new Date(),
            providerId: provider.id,
          })
          .where(eq(brandRegistrations.id, brandId));
      }
      
      return result;
    }

    // For Commio, use their 10DLC API
    if (provider.code === 'commio') {
      const result = await submitCommioBrand(brand, account);
      
      if (result.success) {
        await db
          .update(brandRegistrations)
          .set({
            status: 'pending',
            providerBrandSid: result.brandSid,
            externalBrandId: result.brandSid,
            submittedAt: new Date(),
            updatedAt: new Date(),
            providerId: provider.id,
          })
          .where(eq(brandRegistrations.id, brandId));
      }
      
      return result;
    }

    return { success: false, message: `Provider ${provider.code} not supported for brand registration` };
  } catch (error: any) {
    console.error('Brand registration submission failed:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Submit brand to Twilio
 */
async function submitTwilioBrand(
  brand: BrandRegistration,
  account: any
): Promise<{ success: boolean; message: string; brandSid?: string }> {
  const Twilio = (await import('twilio')).default;
  const client = Twilio(account.accountSid, account.authToken);

  try {
    // Create brand registration via Twilio Messaging API
    const brandRegistration = await client.messaging.v1.brandRegistrations.create({
      customerProfileBundleSid: brand.externalBrandId || undefined, // If already have a profile
      a2PProfileBundleSid: brand.externalBrandId || undefined,
    });

    return {
      success: true,
      message: 'Brand submitted to Twilio for verification',
      brandSid: brandRegistration.sid,
    };
  } catch (error: any) {
    // If brand registration requires Trust Hub first, guide the user
    if (error.code === 45010) {
      return {
        success: false,
        message: 'Please complete Trust Hub verification in Twilio Console first',
      };
    }
    throw error;
  }
}

/**
 * Submit brand to Commio
 */
async function submitCommioBrand(
  brand: BrandRegistration,
  account: any
): Promise<{ success: boolean; message: string; brandSid?: string }> {
  // Commio 10DLC API endpoint
  const response = await fetch(`https://api.thinq.com/account/${account.accountSid}/10dlc/brands`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_name: brand.companyName,
      ein: brand.ein,
      business_type: brand.businessType,
      vertical: brand.vertical,
      contact: {
        first_name: brand.contactFirstName,
        last_name: brand.contactLastName,
        email: brand.contactEmail,
        phone: brand.contactPhone,
      },
      address: {
        street: brand.street,
        city: brand.city,
        state: brand.state,
        postal_code: brand.postalCode,
        country: brand.country,
      },
      website: brand.websiteUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Commio API error: ${error}`);
  }

  const result = await response.json();
  
  return {
    success: true,
    message: 'Brand submitted to Commio for verification',
    brandSid: result.brand_id,
  };
}

// ============================================
// MESSAGING CAMPAIGN REGISTRATION
// ============================================

export interface MessagingCampaignData {
  brandRegistrationId: number;
  accountId: number;
  userId: number;
  campaignName: string;
  description: string;
  useCase: string;
  subUseCase?: string;
  sampleMessages: string[];
  messageFlow?: string;
  optInType: string;
  optInMessage?: string;
  optOutMessage?: string;
  helpMessage?: string;
  hasEmbeddedLinks?: boolean;
  hasEmbeddedPhone?: boolean;
}

/**
 * Create a messaging campaign registration (draft)
 */
export async function createMessagingCampaign(
  data: MessagingCampaignData
): Promise<MessagingCampaign> {
  // Verify brand is approved
  const [brand] = await db
    .select()
    .from(brandRegistrations)
    .where(eq(brandRegistrations.id, data.brandRegistrationId));

  if (!brand) {
    throw new Error('Brand registration not found');
  }

  if (brand.status !== 'approved') {
    throw new Error('Brand must be approved before creating campaigns');
  }

  const [campaign] = await db
    .insert(messagingCampaigns)
    .values({
      ...data,
      status: 'draft',
    })
    .returning();

  return campaign;
}

/**
 * Submit messaging campaign to provider
 */
export async function submitMessagingCampaign(
  campaignId: number
): Promise<{ success: boolean; message: string; externalId?: string }> {
  const [campaign] = await db
    .select()
    .from(messagingCampaigns)
    .where(eq(messagingCampaigns.id, campaignId));

  if (!campaign) {
    return { success: false, message: 'Campaign not found' };
  }

  const [brand] = await db
    .select()
    .from(brandRegistrations)
    .where(eq(brandRegistrations.id, campaign.brandRegistrationId));

  if (!brand || !brand.providerBrandSid) {
    return { success: false, message: 'Brand not properly registered with provider' };
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, campaign.accountId));

  if (!account) {
    return { success: false, message: 'Account not found' };
  }

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, account.providerId));

  try {
    if (provider?.code === 'twilio') {
      const result = await submitTwilioCampaign(campaign, brand, account);
      
      if (result.success) {
        await db
          .update(messagingCampaigns)
          .set({
            status: 'pending',
            providerCampaignSid: result.campaignSid,
            messagingServiceSid: result.messagingServiceSid,
            externalCampaignId: result.campaignSid,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(messagingCampaigns.id, campaignId));
      }
      
      return result;
    }

    if (provider?.code === 'commio') {
      const result = await submitCommioCampaign(campaign, brand, account);
      
      if (result.success) {
        await db
          .update(messagingCampaigns)
          .set({
            status: 'pending',
            providerCampaignSid: result.campaignSid,
            externalCampaignId: result.campaignSid,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(messagingCampaigns.id, campaignId));
      }
      
      return result;
    }

    return { success: false, message: 'Provider not supported' };
  } catch (error: any) {
    console.error('Campaign submission failed:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Submit campaign to Twilio
 */
async function submitTwilioCampaign(
  campaign: MessagingCampaign,
  brand: BrandRegistration,
  account: any
): Promise<{ success: boolean; message: string; campaignSid?: string; messagingServiceSid?: string }> {
  const Twilio = (await import('twilio')).default;
  const client = Twilio(account.accountSid, account.authToken);

  try {
    // First, create or get a Messaging Service
    let messagingService;
    
    if (campaign.messagingServiceSid) {
      messagingService = await client.messaging.v1.services(campaign.messagingServiceSid).fetch();
    } else {
      // Create new messaging service
      messagingService = await client.messaging.v1.services.create({
        friendlyName: campaign.campaignName,
        usecase: campaign.useCase,
      });
    }

    // Create US A2P Campaign
    const a2pCampaign = await client.messaging.v1
      .services(messagingService.sid)
      .usAppToPerson
      .create({
        brandRegistrationSid: brand.providerBrandSid!,
        description: campaign.description,
        messageFlow: campaign.messageFlow || 'End users opt-in via web form',
        messageSamples: campaign.sampleMessages || [],
        usAppToPersonUsecase: campaign.useCase,
        hasEmbeddedLinks: campaign.hasEmbeddedLinks || false,
        hasEmbeddedPhone: campaign.hasEmbeddedPhone || false,
        optInMessage: campaign.optInMessage,
        optOutMessage: campaign.optOutMessage,
        helpMessage: campaign.helpMessage,
        optInKeywords: campaign.optInKeywords || ['START', 'YES'],
        optOutKeywords: campaign.optOutKeywords || ['STOP', 'UNSUBSCRIBE'],
        helpKeywords: campaign.helpKeywords || ['HELP', 'INFO'],
      });

    return {
      success: true,
      message: 'Campaign submitted to Twilio for verification',
      campaignSid: a2pCampaign.sid,
      messagingServiceSid: messagingService.sid,
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Submit campaign to Commio
 */
async function submitCommioCampaign(
  campaign: MessagingCampaign,
  brand: BrandRegistration,
  account: any
): Promise<{ success: boolean; message: string; campaignSid?: string }> {
  const response = await fetch(`https://api.thinq.com/account/${account.accountSid}/10dlc/campaigns`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand_id: brand.providerBrandSid,
      campaign_name: campaign.campaignName,
      description: campaign.description,
      use_case: campaign.useCase,
      sample_messages: campaign.sampleMessages,
      message_flow: campaign.messageFlow,
      opt_in_type: campaign.optInType,
      opt_in_message: campaign.optInMessage,
      opt_out_message: campaign.optOutMessage,
      help_message: campaign.helpMessage,
      has_embedded_links: campaign.hasEmbeddedLinks,
      has_embedded_phone: campaign.hasEmbeddedPhone,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Commio API error: ${error}`);
  }

  const result = await response.json();
  
  return {
    success: true,
    message: 'Campaign submitted to Commio for verification',
    campaignSid: result.campaign_id,
  };
}

// ============================================
// SMS CAMPAIGN SENDING
// ============================================

export interface CreateSmsCampaignData {
  userId: number;
  accountId: number;
  messagingCampaignId?: number;
  name: string;
  description?: string;
  messageTemplate: string;
  mediaUrls?: string[];
  fromNumber: string;
  contactListId?: number;
  scheduledAt?: Date;
  sendingRate?: number;
  timezone?: string;
}

/**
 * Create an SMS campaign
 */
export async function createSmsCampaign(
  data: CreateSmsCampaignData
): Promise<SmsCampaign> {
  const [campaign] = await db
    .insert(smsCampaigns)
    .values({
      ...data,
      status: 'draft',
    })
    .returning();

  return campaign;
}

/**
 * Add recipients to SMS campaign from contact list
 */
export async function addRecipientsFromContactList(
  smsCampaignId: number,
  contactListId: number
): Promise<{ added: number; skipped: number }> {
  console.log('[Campaign] Adding recipients - campaignId:', smsCampaignId, 'contactListId:', contactListId);
  
  // Get campaign
  const [campaign] = await db
    .select()
    .from(smsCampaigns)
    .where(eq(smsCampaigns.id, smsCampaignId));

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  console.log('[Campaign] Found campaign:', campaign.name);

  // Get contacts from list
  const listContacts = await db
    .select({
      contact: contacts,
    })
    .from(contactListMembers)
    .innerJoin(contacts, eq(contactListMembers.contactId, contacts.id))
    .where(eq(contactListMembers.contactListId, contactListId));

  console.log('[Campaign] Found contacts in list:', listContacts.length);

  // Get opt-out list for this account
  const optOuts = await db
    .select()
    .from(optOutList)
    .where(eq(optOutList.accountId, campaign.accountId!));

  const optOutNumbers = new Set(optOuts.map(o => o.phoneNumber));

  let added = 0;
  let skipped = 0;

  for (const { contact } of listContacts) {
    if (!contact.phoneNumber) {
      skipped++;
      continue;
    }

    // Check if opted out
    if (optOutNumbers.has(contact.phoneNumber)) {
      skipped++;
      continue;
    }

    // Check if already added
    const existing = await db
      .select()
      .from(campaignRecipients)
      .where(and(
        eq(campaignRecipients.smsCampaignId, smsCampaignId),
        eq(campaignRecipients.phoneNumber, contact.phoneNumber)
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Add recipient
    await db.insert(campaignRecipients).values({
      smsCampaignId,
      contactId: contact.id,
      phoneNumber: contact.phoneNumber,
      firstName: contact.firstName,
      lastName: contact.lastName,
      status: 'pending',
    });

    added++;
  }

  console.log('[Campaign] Recipients processed - added:', added, 'skipped:', skipped);

  if (added === 0 && listContacts.length === 0) {
    throw new Error('No contacts found in the selected contact list');
  }

  if (added === 0 && listContacts.length > 0) {
    throw new Error('All contacts were skipped (already added or opted out)');
  }

  // Update campaign recipient count
  await db
    .update(smsCampaigns)
    .set({
      recipientCount: sql`${smsCampaigns.recipientCount} + ${added}`,
      contactListId,
      updatedAt: new Date(),
    })
    .where(eq(smsCampaigns.id, smsCampaignId));

  console.log('[Campaign] Successfully added recipients to campaign');
  return { added, skipped };
}

/**
 * Start sending an SMS campaign
 */
export async function startSmsCampaign(
  smsCampaignId: number
): Promise<{ success: boolean; message: string }> {
  const [campaign] = await db
    .select()
    .from(smsCampaigns)
    .where(eq(smsCampaigns.id, smsCampaignId));

  if (!campaign) {
    return { success: false, message: 'Campaign not found' };
  }

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return { success: false, message: `Cannot start campaign in ${campaign.status} status` };
  }

  // Get account and provider
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, campaign.accountId!));

  if (!account || !account.accountSid || !account.authToken) {
    return { success: false, message: 'Account credentials not configured' };
  }

  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, account.providerId));

  if (!provider) {
    return { success: false, message: 'Provider not found' };
  }

  // Update campaign status
  await db
    .update(smsCampaigns)
    .set({
      status: 'sending',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(smsCampaigns.id, smsCampaignId));

  // Start sending in background
  sendCampaignMessages(smsCampaignId, campaign, account, provider.code as ProviderCode)
    .catch(error => {
      console.error(`Campaign ${smsCampaignId} sending failed:`, error);
      db.update(smsCampaigns)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(eq(smsCampaigns.id, smsCampaignId));
    });

  return { success: true, message: 'Campaign started' };
}

/**
 * Send campaign messages (background process)
 */
async function sendCampaignMessages(
  smsCampaignId: number,
  campaign: SmsCampaign,
  account: any,
  providerCode: ProviderCode
): Promise<void> {
  // Create provider instance
  const providerInstance = providerFactory.create({
    code: providerCode,
    credentials: {
      accountSid: account.accountSid,
      authToken: account.authToken,
    },
    accountId: account.id,
  });

  // Get pending recipients in batches
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Check if campaign is still in sending status
    const [currentCampaign] = await db
      .select()
      .from(smsCampaigns)
      .where(eq(smsCampaigns.id, smsCampaignId));

    if (currentCampaign?.status !== 'sending') {
      console.log(`Campaign ${smsCampaignId} stopped (status: ${currentCampaign?.status})`);
      return;
    }

    // Get batch of recipients
    const recipients = await db
      .select()
      .from(campaignRecipients)
      .where(and(
        eq(campaignRecipients.smsCampaignId, smsCampaignId),
        eq(campaignRecipients.status, 'pending')
      ))
      .limit(batchSize)
      .offset(offset);

    if (recipients.length === 0) {
      hasMore = false;
      break;
    }

    // Send to each recipient
    for (const recipient of recipients) {
      try {
        // Apply merge tags
        const personalizedMessage = applyMergeTags(campaign.messageTemplate, {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          phoneNumber: recipient.phoneNumber,
          ...((recipient.customFields as Record<string, any>) || {}),
        });

        // Send message
        const result = await providerInstance.sendMessage({
          to: recipient.phoneNumber,
          from: campaign.fromNumber,
          body: personalizedMessage,
          mediaUrls: campaign.mediaUrls || undefined,
        });

        if (result.success) {
          await db
            .update(campaignRecipients)
            .set({
              status: 'sent',
              messageSid: result.sid,
              sentAt: new Date(),
            })
            .where(eq(campaignRecipients.id, recipient.id));

          await db
            .update(smsCampaigns)
            .set({ sentCount: sql`${smsCampaigns.sentCount} + 1` })
            .where(eq(smsCampaigns.id, smsCampaignId));
        } else {
          await db
            .update(campaignRecipients)
            .set({
              status: 'failed',
              failedAt: new Date(),
              errorMessage: result.error,
            })
            .where(eq(campaignRecipients.id, recipient.id));

          await db
            .update(smsCampaigns)
            .set({ failedCount: sql`${smsCampaigns.failedCount} + 1` })
            .where(eq(smsCampaigns.id, smsCampaignId));
        }

        // Rate limiting
        const sendingRate = campaign.sendingRate || 1;
        await sleep(1000 / sendingRate);
      } catch (error: any) {
        console.error(`Failed to send to ${recipient.phoneNumber}:`, error);
        
        await db
          .update(campaignRecipients)
          .set({
            status: 'failed',
            failedAt: new Date(),
            errorMessage: error.message,
          })
          .where(eq(campaignRecipients.id, recipient.id));

        await db
          .update(smsCampaigns)
          .set({ failedCount: sql`${smsCampaigns.failedCount} + 1` })
          .where(eq(smsCampaigns.id, smsCampaignId));
      }
    }

    offset += batchSize;
  }

  // Mark campaign as completed
  await db
    .update(smsCampaigns)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(smsCampaigns.id, smsCampaignId));

  console.log(`Campaign ${smsCampaignId} completed`);
}

/**
 * Pause an SMS campaign
 */
export async function pauseSmsCampaign(
  smsCampaignId: number
): Promise<{ success: boolean; message: string }> {
  await db
    .update(smsCampaigns)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(smsCampaigns.id, smsCampaignId));

  return { success: true, message: 'Campaign paused' };
}

/**
 * Get campaign statistics
 */
export async function getCampaignStats(smsCampaignId: number): Promise<{
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  optOutCount: number;
  pendingCount: number;
  deliveryRate: number;
}> {
  const [campaign] = await db
    .select()
    .from(smsCampaigns)
    .where(eq(smsCampaigns.id, smsCampaignId));

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const [pendingResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaignRecipients)
    .where(and(
      eq(campaignRecipients.smsCampaignId, smsCampaignId),
      eq(campaignRecipients.status, 'pending')
    ));

  const deliveryRate = campaign.sentCount! > 0
    ? (campaign.deliveredCount! / campaign.sentCount!) * 100
    : 0;

  return {
    recipientCount: campaign.recipientCount || 0,
    sentCount: campaign.sentCount || 0,
    deliveredCount: campaign.deliveredCount || 0,
    failedCount: campaign.failedCount || 0,
    optOutCount: campaign.optOutCount || 0,
    pendingCount: pendingResult.count,
    deliveryRate,
  };
}

// ============================================
// OPT-OUT MANAGEMENT
// ============================================

/**
 * Add phone number to opt-out list
 */
export async function addOptOut(
  accountId: number,
  phoneNumber: string,
  reason?: string,
  source?: string
): Promise<void> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Check if already opted out
  const existing = await db
    .select()
    .from(optOutList)
    .where(and(
      eq(optOutList.accountId, accountId),
      eq(optOutList.phoneNumber, normalizedPhone)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(optOutList).values({
      accountId,
      phoneNumber: normalizedPhone,
      reason,
      source,
    });
  }
}

/**
 * Check if phone number is opted out
 */
export async function isOptedOut(
  accountId: number,
  phoneNumber: string
): Promise<boolean> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const [result] = await db
    .select()
    .from(optOutList)
    .where(and(
      eq(optOutList.accountId, accountId),
      eq(optOutList.phoneNumber, normalizedPhone)
    ))
    .limit(1);

  return !!result;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Validate phone number format
 */
function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // US numbers should have 10 or 11 digits
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Add country code if missing (assume US)
  if (digits.length === 10) {
    digits = '1' + digits;
  }
  
  return '+' + digits;
}

/**
 * Apply merge tags to message template
 */
function applyMergeTags(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export service instance
export const campaignService = {
  // Contacts
  importContacts,
  createContactList,
  deleteContactList,
  
  // Brand Registration
  createBrandRegistration,
  submitBrandRegistration,
  
  // Messaging Campaigns
  createMessagingCampaign,
  submitMessagingCampaign,
  
  // SMS Campaigns
  createSmsCampaign,
  addRecipientsFromContactList,
  startSmsCampaign,
  pauseSmsCampaign,
  getCampaignStats,
  
  // Opt-out
  addOptOut,
  isOptedOut,
};
