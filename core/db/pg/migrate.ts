import process from 'node:process'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.POSTGRES_URL
if (!url) {
  console.error('⚠️ POSTGRES_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool)

migrate(db, {
  migrationsFolder: './migrations/pg',
}).then(() => {
  // eslint-disable-next-line no-console
  console.log('🎉 Migration complete')
}).catch((error) => {
  console.error('⚠️ Migration failed')
  console.error(error)
  process.exitCode = 1
}).finally(() => pool.end())
