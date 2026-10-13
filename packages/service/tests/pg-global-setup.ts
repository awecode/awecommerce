import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { loadEnv } from 'vite'

// Migrates the real Postgres used by the Postgres-only tests once per run,
// before any test file starts. Migrating from each file in parallel races on
// CREATE EXTENSION and fails intermittently.
export default async function setup() {
  // Same sources as the test workers (see vitest.config.mts): the environment,
  // then .env. Global setup runs in the main process, which does not get them.
  const url =
    process.env.TEST_POSTGRES_URL ??
    loadEnv('', process.cwd(), '').TEST_POSTGRES_URL
  if (!url) {
    return
  }
  const pool = new pg.Pool({ connectionString: url })
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(process.cwd(), 'migrations/pg'),
    })
  } finally {
    await pool.end()
  }
}
