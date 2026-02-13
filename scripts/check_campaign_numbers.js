import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkCampaignNumbers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('CAMPAIGN PHONE NUMBERS CHECK');
  console.log('========================================\n');

  // Get recent campaigns with their from_number
  const result = await pool.query(`
    SELECT id, name, from_number, status, sent_count, recipient_count
    FROM sms_campaigns 
    ORDER BY id DESC 
    LIMIT 5
  `);

  for (const campaign of result.rows) {
    console.log(`\nCampaign #${campaign.id}: ${campaign.name}`);
    console.log(`  Status: ${campaign.status}`);
    console.log(`  Sent: ${campaign.sent_count || 0} / ${campaign.recipient_count || 0}`);
    
    const fromNumbers = (campaign.from_number || '').split(',').map(n => n.trim()).filter(Boolean);
    console.log(`  From Numbers: ${fromNumbers.length}`);
    
    if (fromNumbers.length <= 20) {
      for (const num of fromNumbers) {
        console.log(`    - ${num}`);
      }
    } else {
      for (const num of fromNumbers.slice(0, 10)) {
        console.log(`    - ${num}`);
      }
      console.log(`    ... and ${fromNumbers.length - 10} more`);
    }
  }

  await pool.end();
}

checkCampaignNumbers().catch(console.error);
