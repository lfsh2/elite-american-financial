import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function checkAccountSettings() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================');
  console.log('ACCOUNT SETTINGS CHECK');
  console.log('========================================\n');

  const result = await pool.query(`
    SELECT a.id, a.name, a.account_sid, a.settings, p.code as provider_code
    FROM accounts a
    JOIN providers p ON a.provider_id = p.id
    ORDER BY p.code, a.name
  `);

  for (const account of result.rows) {
    console.log(`\n${account.provider_code.toUpperCase()}: ${account.name} (ID: ${account.id})`);
    console.log(`  Account SID: ${account.account_sid}`);
    
    const settings = account.settings || {};
    const importedNumbers = settings.importedPhoneNumbers || [];
    
    console.log(`  Imported Phone Numbers: ${importedNumbers.length}`);
    
    if (importedNumbers.length > 0) {
      console.log(`  Numbers:`);
      for (const num of importedNumbers.slice(0, 10)) {
        console.log(`    - ${num.phoneNumber || num}`);
      }
      if (importedNumbers.length > 10) {
        console.log(`    ... and ${importedNumbers.length - 10} more`);
      }
    }
  }

  await pool.end();
}

checkAccountSettings().catch(console.error);
