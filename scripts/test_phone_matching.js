import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function testPhoneMatching() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('PHONE NUMBER MATCHING TEST');
  console.log('========================================\n');

  // Get Commio account
  const accountResult = await pool.query(`
    SELECT a.id, a.name, a.account_sid, a.auth_token, a.api_key, a.settings, p.code as provider_code
    FROM accounts a
    JOIN providers p ON a.provider_id = p.id
    WHERE p.code = 'commio'
  `);

  if (accountResult.rows.length === 0) {
    console.log('No Commio account found');
    await pool.end();
    return;
  }

  const account = accountResult.rows[0];
  console.log(`Commio Account: ${account.name} (ID: ${account.id})`);
  console.log(`  Account SID: ${account.account_sid}`);
  console.log(`  API Key: ${account.api_key}`);
  console.log(`  Auth Token: ${account.auth_token?.substring(0, 10)}...`);
  
  const settings = account.settings || {};
  const importedNumbers = settings.importedPhoneNumbers || [];
  
  console.log(`\nImported Phone Numbers: ${importedNumbers.length}`);
  
  // Check the format of imported numbers
  if (importedNumbers.length > 0) {
    console.log('\nSample imported number format:');
    console.log(JSON.stringify(importedNumbers[0], null, 2));
  }

  // Get campaign #23's from_number list
  const campaignResult = await pool.query(`
    SELECT from_number FROM sms_campaigns WHERE id = 23
  `);
  
  if (campaignResult.rows.length > 0) {
    const fromNumbers = (campaignResult.rows[0].from_number || '').split(',').map(n => n.trim()).filter(Boolean);
    console.log(`\nCampaign #23 has ${fromNumbers.length} from numbers`);
    
    // Check how many match imported numbers
    let matchCount = 0;
    let noMatchSamples = [];
    
    for (const num of fromNumbers) {
      const found = importedNumbers.find(imp => {
        const impNum = imp.phoneNumber || imp;
        return impNum === num || impNum === num.replace('+', '') || `+${impNum}` === num;
      });
      
      if (found) {
        matchCount++;
      } else {
        if (noMatchSamples.length < 5) {
          noMatchSamples.push(num);
        }
      }
    }
    
    console.log(`  Matched to imported: ${matchCount}/${fromNumbers.length}`);
    
    if (noMatchSamples.length > 0) {
      console.log(`  Sample non-matching numbers: ${noMatchSamples.join(', ')}`);
    }
  }

  // Check credentials format
  console.log('\n========================================');
  console.log('CREDENTIALS CHECK');
  console.log('========================================');
  console.log(`\nFor Commio batch sending, the system needs:`);
  console.log(`  - apiKey (username): ${account.api_key || 'MISSING!'}`);
  console.log(`  - authToken (API token): ${account.auth_token ? 'Present' : 'MISSING!'}`);
  console.log(`  - accountSid (numeric ID): ${account.account_sid || 'MISSING!'}`);
  
  const hasAllCreds = account.api_key && account.auth_token && account.account_sid;
  console.log(`\n${hasAllCreds ? '✓' : '✗'} All credentials ${hasAllCreds ? 'present' : 'NOT present'}`);

  await pool.end();
}

testPhoneMatching().catch(console.error);
