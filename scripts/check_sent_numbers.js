import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkSentNumbers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('SENT MESSAGES - FROM NUMBERS ANALYSIS');
  console.log('========================================\n');

  // Get distinct from numbers used in recent campaigns
  const result = await pool.query(`
    SELECT 
      sm.campaign_id,
      sc.name as campaign_name,
      sm."from" as from_number,
      COUNT(*) as message_count,
      COUNT(CASE WHEN sm.status = 'sent' OR sm.status = 'delivered' THEN 1 END) as success_count,
      COUNT(CASE WHEN sm.status = 'failed' THEN 1 END) as failed_count
    FROM sms_messages sm
    LEFT JOIN sms_campaigns sc ON sm.campaign_id = sc.id
    WHERE sm.campaign_id IS NOT NULL
    GROUP BY sm.campaign_id, sc.name, sm."from"
    ORDER BY sm.campaign_id DESC, message_count DESC
  `);

  // Group by campaign
  const byCampaign = {};
  for (const row of result.rows) {
    const key = row.campaign_id;
    if (!byCampaign[key]) {
      byCampaign[key] = {
        name: row.campaign_name,
        numbers: []
      };
    }
    byCampaign[key].numbers.push({
      from: row.from_number,
      total: parseInt(row.message_count),
      success: parseInt(row.success_count),
      failed: parseInt(row.failed_count)
    });
  }

  // Show results
  for (const [campaignId, data] of Object.entries(byCampaign).slice(0, 5)) {
    console.log(`\nCampaign #${campaignId}: ${data.name}`);
    console.log(`  Unique FROM numbers used: ${data.numbers.length}`);
    
    const totalSent = data.numbers.reduce((sum, n) => sum + n.total, 0);
    const totalSuccess = data.numbers.reduce((sum, n) => sum + n.success, 0);
    const totalFailed = data.numbers.reduce((sum, n) => sum + n.failed, 0);
    
    console.log(`  Total messages: ${totalSent} (${totalSuccess} success, ${totalFailed} failed)`);
    
    console.log(`  Numbers breakdown:`);
    for (const num of data.numbers.slice(0, 20)) {
      console.log(`    ${num.from}: ${num.total} msgs (${num.success} ok, ${num.failed} fail)`);
    }
    if (data.numbers.length > 20) {
      console.log(`    ... and ${data.numbers.length - 20} more numbers`);
    }
  }

  await pool.end();
}

checkSentNumbers().catch(console.error);
