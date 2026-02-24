/**
 * Script to set recipient limit for SMS campaigns
 * Usage: node scripts/set_campaign_recipient_limit.js <campaignId> <limit>
 * 
 * Example: node scripts/set_campaign_recipient_limit.js 123 20000
 */

import { db } from '../server/db';
import { smsCampaigns } from '../shared/schema';
import { eq } from 'drizzle-orm';

const campaignId = parseInt(process.argv[2]);
const recipientLimit = parseInt(process.argv[3]);

if (!campaignId || !recipientLimit) {
  console.error('Usage: node scripts/set_campaign_recipient_limit.js <campaignId> <limit>');
  console.error('Example: node scripts/set_campaign_recipient_limit.js 123 20000');
  process.exit(1);
}

async function setRecipientLimit() {
  try {
    // Get campaign
    const [campaign] = await db
      .select()
      .from(smsCampaigns)
      .where(eq(smsCampaigns.id, campaignId));

    if (!campaign) {
      console.error(`Campaign ${campaignId} not found`);
      process.exit(1);
    }

    console.log(`Campaign: ${campaign.name}`);
    console.log(`Current recipient count: ${campaign.recipientCount}`);
    console.log(`Current recipient limit: ${campaign.recipientLimit || 'No limit'}`);
    console.log(`Setting new limit to: ${recipientLimit}`);

    // Update the limit
    await db
      .update(smsCampaigns)
      .set({ recipientLimit })
      .where(eq(smsCampaigns.id, campaignId));

    console.log(`✓ Successfully set recipient limit to ${recipientLimit} for campaign ${campaignId}`);

    if (campaign.recipientCount > recipientLimit) {
      console.warn(`⚠️  Warning: Current recipient count (${campaign.recipientCount}) exceeds the new limit (${recipientLimit})`);
      console.warn(`   The campaign will not send to recipients beyond the limit.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error setting recipient limit:', error);
    process.exit(1);
  }
}

setRecipientLimit();
