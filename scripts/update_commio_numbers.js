import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

async function updateCommioNumbers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('UPDATING COMMIO PHONE NUMBERS');
  console.log('========================================\n');

  // Read the CSV file
  const csvPath = '/Users/leesmacbook/Documents/SoftlinkiQ/textflow/comio numbers.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.trim().split('\n');
  
  // Parse CSV (skip header)
  const phoneNumbers = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Parse CSV properly (handle quoted fields)
    const parts = line.split(',');
    const phoneNumber = parts[0]; // PHONE_NUMBER column
    const campaignId = parts[19]; // CAMPAIGN_ID column
    const smsEnabled = parts[15] === 'ON'; // SMS column
    
    if (phoneNumber && phoneNumber.length >= 10) {
      phoneNumbers.push({
        phoneNumber: `+${phoneNumber}`,
        friendlyName: `+${phoneNumber}`,
        capabilities: { sms: smsEnabled, voice: true, mms: false },
        status: 'active',
        a2pStatus: 'registered',
        a2pCampaignId: campaignId || 'CYA7NIN',
      });
    }
  }

  console.log(`Parsed ${phoneNumbers.length} phone numbers from CSV`);
  
  // Show sample
  console.log('\nSample numbers:');
  for (const num of phoneNumbers.slice(0, 5)) {
    console.log(`  ${num.phoneNumber} - Campaign: ${num.a2pCampaignId}`);
  }

  // Get current account
  const accResult = await pool.query(`
    SELECT id, settings FROM accounts WHERE account_sid = '22956'
  `);
  
  if (accResult.rows.length === 0) {
    console.log('ERROR: Commio account not found');
    await pool.end();
    return;
  }

  const account = accResult.rows[0];
  const currentSettings = account.settings || {};
  
  console.log(`\nCurrent imported numbers: ${(currentSettings.importedPhoneNumbers || []).length}`);
  console.log(`New numbers to import: ${phoneNumbers.length}`);

  // Update settings with new phone numbers
  const newSettings = {
    ...currentSettings,
    importedPhoneNumbers: phoneNumbers,
  };

  await pool.query(`
    UPDATE accounts 
    SET settings = $1, updated_at = NOW()
    WHERE id = $2
  `, [JSON.stringify(newSettings), account.id]);

  console.log('\n✓ Successfully updated Commio phone numbers!');
  
  // Verify
  const verifyResult = await pool.query(`
    SELECT settings FROM accounts WHERE id = $1
  `, [account.id]);
  
  const updatedNumbers = (verifyResult.rows[0].settings?.importedPhoneNumbers || []).length;
  console.log(`Verified: ${updatedNumbers} numbers now in database`);

  await pool.end();
}

updateCommioNumbers().catch(console.error);
