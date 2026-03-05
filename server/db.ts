import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../shared/schema';

// Create database connection with optimized pool for batch operations
const sql = postgres(process.env.DATABASE_URL!, {
  max: 50, // Increased from 10 to handle batch SMS sending load
  idle_timeout: 30, // Keep connections alive longer during batch operations
  connect_timeout: 15, // Slightly longer timeout for busy periods
  ssl: 'require',
});
export const db = drizzle(sql, { schema });

// Export for type inference
export type Database = typeof db;
