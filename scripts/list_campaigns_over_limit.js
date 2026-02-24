/**
 * Script to list all campaigns that exceed a specified recipient limit
 * Usage: node scripts/list_campaigns_over_limit.js [limit]
 * 
 * Example: node scripts/list_campaigns_over_limit.js 20000
 */

import { db } from '../server/db';
import { smsCampaigns } from '../shared/schema';
import { gt, sql } from 'drizzle-orm';

const limit = parseInt(process.argv[2]) || 20000;

async function listCampaignsOverLimit() {
  try {
    console.log(`\nSearching for campaigns with more than ${limit} recipients...\n`);

    const campaigns = await db
      .select({
        id: smsCampaigns.id,
        name: smsCampaigns.name,
        recipientCount: smsCampaigns.recipientCount,
        recipientLimit: smsCampaigns.recipientLimit,
        status: smsCampaigns.status,
        sentCount: smsCampaigns.sentCount,
        createdAt: smsCampaigns.createdAt,
      })
      .from(smsCampaigns)
      .where(gt(smsCampaigns.recipientCount, limit))
      .orderBy(sql`${smsCampaigns.recipientCount} DESC`);

    if (campaigns.length === 0) {
      console.log(`No campaigns found with more than ${limit} recipients.`);
      process.exit(0);
    }

    console.log(`Found ${campaigns.length} campaign(s) exceeding ${limit} recipients:\n`);
    console.log('ID\tName\t\t\t\tRecipients\tLimit\t\tStatus\t\tSent');
    console.log('─'.repeat(100));

    for (const campaign of campaigns) {
      const name = campaign.name.substring(0, 25).padEnd(25);
      const recipients = campaign.recipientCount.toString().padEnd(10);
      const currentLimit = (campaign.recipientLimit || 'None').toString().padEnd(10);
      const status = campaign.status.padEnd(12);
      const sent = campaign.sentCount.toString();

      console.log(`${campaign.id}\t${name}\t${recipients}\t${currentLimit}\t${status}\t${sent}`);
    }

    console.log('\n');
    console.log('To set a recipient limit for a campaign, run:');
    console.log('node scripts/set_campaign_recipient_limit.js <campaignId> <limit>');
    console.log('\nExample:');
    console.log(`node scripts/set_campaign_recipient_limit.js ${campaigns[0].id} 20000`);

    process.exit(0);
  } catch (error) {
    console.error('Error listing campaigns:', error);
    process.exit(1);
  }
}

listCampaignsOverLimit();
