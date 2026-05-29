import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

if (process.env.RUN_MIGRATIONS !== 'true') {
  console.log('RUN_MIGRATIONS != "true" — skipping migrations');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations');
  process.exit(1);
}

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/db/pg/migrations',
);

async function run() {
  const sql = postgres(databaseUrl!, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log('Migrations applied');
}

run().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
