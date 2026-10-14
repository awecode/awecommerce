import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

// Migrates TEST_POSTGRES_URL once per run with the library's and the auth
// layer's migrations. Set
// by `pnpm test`, which starts a temporary Postgres when it is not set.
export default async function setup() {
  const url = process.env.TEST_POSTGRES_URL
  if (!url) {
    return
  }
  const pool = new pg.Pool({ connectionString: url })
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../../service/migrations/pg', import.meta.url)),
    })
    // The auth layer's tables, with their own migrations table
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../../auth/migrations', import.meta.url)),
      migrationsTable: '__drizzle_migrations_auth',
    })
  } finally {
    await pool.end()
  }
}
