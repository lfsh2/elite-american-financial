import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function testCommioSend() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('COMMIO SMS SEND TEST');
  console.log('========================================\n');

  // Get Commio account credentials
  const acc = await pool.query(`
    SELECT account_sid, auth_token, api_key, settings 
    FROM accounts WHERE account_sid = '22956'
  `);
  
  if (acc.rows.length === 0) {
    console.log('No Commio account found');
    await pool.end();
    return;
  }

  const account = acc.rows[0];
  const settings = account.settings || {};
  const importedNumbers = settings.importedPhoneNumbers || [];
  
  console.log('Account ID:', account.account_sid);
  console.log('API Key (username):', account.api_key);
  console.log('Auth Token:', account.auth_token?.substring(0, 10) + '...');
  console.log('Imported numbers:', importedNumbers.length);

  // Test with first few numbers
  const testNumbers = importedNumbers.slice(0, 5);
  const testTo = '9999999999'; // Fake number - won't actually send
  
  console.log('\n--- Testing SMS send for each number ---\n');
  
  for (const numObj of testNumbers) {
    const fromNumber = numObj.phoneNumber;
    const fromDid = fromNumber.replace(/[^\d]/g, '');
    
    const url = `https://api.thinq.com/account/${account.account_sid}/product/origination/sms/send`;
    const auth = Buffer.from(`${account.api_key}:${account.auth_token}`).toString('base64');
    
    console.log(`Testing: ${fromNumber}`);
    console.log(`  URL: ${url}`);
    console.log(`  from_did: ${fromDid}`);
    
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
          message: 'Test message',
        }),
      });

      const responseText = await response.text();
      console.log(`  Status: ${response.status}`);
      console.log(`  Response: ${responseText.substring(0, 300)}`);
      
      if (response.ok) {
        console.log(`  ✓ SUCCESS`);
      } else {
        console.log(`  ✗ FAILED`);
      }
    } catch (error) {
      console.log(`  ✗ ERROR: ${error.message}`);
    }
    
    console.log('');
  }

  await pool.end();
}

testCommioSend().catch(console.error);
