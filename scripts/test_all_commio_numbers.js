import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function testAllCommioNumbers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('TESTING ALL COMMIO NUMBERS');
  console.log('========================================\n');

  // Get Commio account credentials
  const acc = await pool.query(`
    SELECT account_sid, auth_token, api_key, settings 
    FROM accounts WHERE account_sid = '22956'
  `);
  
  const account = acc.rows[0];
  const settings = account.settings || {};
  const importedNumbers = settings.importedPhoneNumbers || [];
  
  console.log('Testing', importedNumbers.length, 'numbers...\n');

  const workingNumbers = [];
  const failedNumbers = [];
  const testTo = '9999999999';
  
  for (const numObj of importedNumbers) {
    const fromNumber = numObj.phoneNumber;
    const fromDid = fromNumber.replace(/[^\d]/g, '');
    
    const url = `https://api.thinq.com/account/${account.account_sid}/product/origination/sms/send`;
    const auth = Buffer.from(`${account.api_key}:${account.auth_token}`).toString('base64');
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify({
          from_did: fromDid,
          to_did: testTo,
          message: 'Test',
        }),
      });

      if (response.ok) {
        workingNumbers.push(fromNumber);
        process.stdout.write('✓');
      } else {
        const text = await response.text();
        failedNumbers.push({ number: fromNumber, error: text.substring(0, 100) });
        process.stdout.write('✗');
      }
    } catch (error) {
      failedNumbers.push({ number: fromNumber, error: error.message });
      process.stdout.write('E');
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n\n========================================');
  console.log('RESULTS');
  console.log('========================================');
  console.log(`✓ Working numbers: ${workingNumbers.length}`);
  console.log(`✗ Failed numbers: ${failedNumbers.length}`);
  
  console.log('\n=== WORKING NUMBERS ===');
  for (const num of workingNumbers) {
    console.log(`  ${num}`);
  }
  
  if (failedNumbers.length > 0 && failedNumbers.length <= 10) {
    console.log('\n=== FAILED NUMBERS ===');
    for (const f of failedNumbers) {
      console.log(`  ${f.number}: ${f.error}`);
    }
  }

  await pool.end();
}

testAllCommioNumbers().catch(console.error);
