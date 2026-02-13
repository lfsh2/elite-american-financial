import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkPhoneNumbers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('PHONE NUMBERS IN DATABASE');
  console.log('========================================\n');

  // Get all phone numbers from account_phone_numbers
  const result = await pool.query(`
    SELECT apn.id, apn.phone_number, apn.friendly_name, apn.status, apn.capabilities,
           a.name as account_name, a.account_sid, p.code as provider_code
    FROM account_phone_numbers apn
    JOIN accounts a ON apn.account_id = a.id
    JOIN providers p ON a.provider_id = p.id
    ORDER BY p.code, apn.phone_number
  `);

  console.log(`Total phone numbers in database: ${result.rows.length}\n`);

  // Group by provider
  const byProvider = {};
  for (const row of result.rows) {
    if (!byProvider[row.provider_code]) {
      byProvider[row.provider_code] = [];
    }
    byProvider[row.provider_code].push(row);
  }

  for (const [provider, numbers] of Object.entries(byProvider)) {
    console.log(`\n${provider.toUpperCase()} (${numbers.length} numbers):`);
    console.log('----------------------------------------');
    
    let smsEnabled = 0;
    let smsDisabled = 0;
    
    for (const num of numbers) {
      const capabilities = num.capabilities || {};
      const canSms = capabilities.sms !== false;
      if (canSms) smsEnabled++;
      else smsDisabled++;
      
      const statusIcon = num.status === 'active' && canSms ? '✓' : '✗';
      console.log(`  ${statusIcon} ${num.phone_number} | Status: ${num.status} | SMS: ${canSms ? 'YES' : 'NO'}`);
    }
    
    console.log(`\n  Summary: ${smsEnabled} SMS-enabled, ${smsDisabled} SMS-disabled`);
  }

  // Check user_phone_assignments
  console.log('\n\n========================================');
  console.log('USER PHONE ASSIGNMENTS');
  console.log('========================================\n');

  const assignments = await pool.query(`
    SELECT upa.id, upa.phone_number, upa.is_active, upa.daily_limit, upa.messages_sent_today,
           u.email as user_email, a.name as account_name
    FROM user_phone_assignments upa
    LEFT JOIN users u ON upa.user_id = u.id
    LEFT JOIN accounts a ON upa.account_id = a.id
    WHERE upa.is_active = true
    ORDER BY upa.phone_number
  `);

  console.log(`Active phone assignments: ${assignments.rows.length}\n`);
  
  for (const row of assignments.rows) {
    console.log(`  ${row.phone_number} | User: ${row.user_email} | Limit: ${row.daily_limit} | Sent today: ${row.messages_sent_today}`);
  }

  await pool.end();
}

checkPhoneNumbers().catch(console.error);
