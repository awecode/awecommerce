import process from 'node:process'

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { drizzle } from 'drizzle-orm/postgres-js'

const url = `${process.env.POSTGRES_URL}`
const db = drizzle(postgres(url))

migrate(db, {
  migrationsFolder: './migrations/pg',
}).then(() =>
  // eslint-disable-next-line no-console
  console.log('🎉 Migration complete'),
).catch((error) => {
  console.error('⚠️ Migration failed')
  console.error(error)
}).finally(() => {
  process.exit()
})