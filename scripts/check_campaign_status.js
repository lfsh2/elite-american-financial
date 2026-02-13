import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkCampaignStatus() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('CAMPAIGN STATUS CHECK');
  console.log('========================================\n');

  // Get recent campaigns
  const result = await pool.query(`
    SELECT id, name, status, sent_count, failed_count, recipient_count, 
           started_at, updated_at, created_at
    FROM sms_campaigns 
    ORDER BY updated_at DESC 
    LIMIT 10
  `);

  if (result.rows.length === 0) {
    console.log('No campaigns found.');
  } else {
    console.log('Recent Campaigns:\n');
    for (const campaign of result.rows) {
      const statusIcon = campaign.status === 'paused' ? '⏸️' : 
                         campaign.status === 'sending' ? '▶️' :
                         campaign.status === 'completed' ? '✓' :
                         campaign.status === 'cancelled' ? '✗' : '○';
      
      console.log(`${statusIcon} Campaign #${campaign.id}: ${campaign.name}`);
      console.log(`   Status: ${campaign.status.toUpperCase()}`);
      console.log(`   Sent: ${campaign.sent_count || 0} / ${campaign.recipient_count || 0}`);
      console.log(`   Failed: ${campaign.failed_count || 0}`);
      console.log(`   Updated: ${campaign.updated_at}`);
      console.log('');
    }
  }

  await pool.end();
}

checkCampaignStatus().catch(console.error);
