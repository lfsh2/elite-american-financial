import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const NEW_TOKEN = 'f36e639823626db0dab1b8235cff8b90039f8aea';

async function updateToken() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const result = await pool.query(`
    UPDATE accounts 
    SET auth_token = $1 
    WHERE account_sid = '22956'
    RETURNING id, name, account_sid
  `, [NEW_TOKEN]);
  
  console.log('Updated:', result.rows);
  await pool.end();
}

updateToken().catch(console.error);
