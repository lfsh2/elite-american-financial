/**
 * Script to fix campaigns that have already exceeded their recipient limit
 * This will mark excess recipients as 'skipped' and update campaign counts
 * 
 * Usage: node scripts/fix_campaign_over_limit.js <campaignId>
 * Example: node scripts/fix_campaign_over_limit.js 66
 */

import { db } from '../server/db';
import { smsCampaigns, campaignRecipients } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const campaignId = parseInt(process.argv[2]);

if (!campaignId) {
  console.error('Usage: node scripts/fix_campaign_over_limit.js <campaignId>');
  console.error('Example: node scripts/fix_campaign_over_limit.js 66');
  process.exit(1);
}

async function fixCampaignOverLimit() {
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

    console.log(`\nCampaign: ${campaign.name}`);
    console.log(`Status: ${campaign.status}`);
    console.log(`Recipient limit: ${campaign.recipientLimit || 'No limit'}`);
    console.log(`Current sent count: ${campaign.sentCount}`);
    console.log(`Current recipient count: ${campaign.recipientCount}`);

    if (!campaign.recipientLimit) {
      console.log('\n✓ Campaign has no recipient limit. Nothing to fix.');
      process.exit(0);
    }

    if (campaign.sentCount <= campaign.recipientLimit) {
      console.log('\n✓ Campaign is within the recipient limit. Nothing to fix.');
      process.exit(0);
    }

    console.log(`\n⚠️  Campaign exceeded limit by ${campaign.sentCount - campaign.recipientLimit} messages`);
    console.log('\nFetching all sent recipients...');

    // Get all sent recipients ordered by when they were sent
    const sentRecipients = await db
      .select()
      .from(campaignRecipients)
      .where(and(
        eq(campaignRecipients.smsCampaignId, campaignId),
        eq(campaignRecipients.status, 'sent')
      ))
      .orderBy(campaignRecipients.sentAt);

    console.log(`Found ${sentRecipients.length} sent recipients`);

    if (sentRecipients.length <= campaign.recipientLimit) {
      console.log('\n✓ Sent recipients are within limit. Updating campaign counts...');
      
      // Just update the campaign counts
      await db
        .update(smsCampaigns)
        .set({ 
          sentCount: sentRecipients.length,
          updatedAt: new Date() 
        })
        .where(eq(smsCampaigns.id, campaignId));
      
      console.log(`✓ Updated sent count to ${sentRecipients.length}`);
      process.exit(0);
    }

    // Mark recipients beyond the limit as 'skipped'
    const recipientsToKeep = sentRecipients.slice(0, campaign.recipientLimit);
    const recipientsToSkip = sentRecipients.slice(campaign.recipientLimit);

    console.log(`\nKeeping first ${recipientsToKeep.length} sent messages`);
    console.log(`Marking ${recipientsToSkip.length} excess messages as 'skipped'`);

    // Update excess recipients to 'skipped' status
    const recipientIdsToSkip = recipientsToSkip.map(r => r.id);
    
    if (recipientIdsToSkip.length > 0) {
      // Process in batches of 1000
      const BATCH_SIZE = 1000;
      for (let i = 0; i < recipientIdsToSkip.length; i += BATCH_SIZE) {
        const batch = recipientIdsToSkip.slice(i, i + BATCH_SIZE);
        await db.execute(sql`
          UPDATE campaign_recipients 
          SET status = 'skipped', 
              error_message = 'Exceeded campaign recipient limit',
              sent_at = NULL,
              message_sid = NULL
          WHERE id = ANY(${batch})
        `);
        console.log(`  Updated batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(recipientIdsToSkip.length / BATCH_SIZE)}`);
      }
    }

    // Recalculate campaign stats
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count
      FROM campaign_recipients
      WHERE sms_campaign_id = ${campaignId}
    `);

    const { sent_count, delivered_count, failed_count } = stats.rows[0];

    // Update campaign with correct counts
    await db
      .update(smsCampaigns)
      .set({
        sentCount: parseInt(sent_count) || 0,
        deliveredCount: parseInt(delivered_count) || 0,
        failedCount: parseInt(failed_count) || 0,
        updatedAt: new Date(),
      })
      .where(eq(smsCampaigns.id, campaignId));

    console.log('\n✓ Campaign fixed successfully!');
    console.log(`  Sent count: ${sent_count} (was ${campaign.sentCount})`);
    console.log(`  Delivered count: ${delivered_count}`);
    console.log(`  Failed count: ${failed_count}`);
    console.log(`  Skipped: ${recipientsToSkip.length}`);
    console.log(`  Recipient limit: ${campaign.recipientLimit}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error fixing campaign:', error);
    process.exit(1);
  }
}

fixCampaignOverLimit();
