import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import { getClient } from '../core/db/pg/db'

// Importing db initializes the PGlite client used below
import 'core/db'

const doMigrate = async () => {
  console.log('Running migrations ...')
  const client = getClient()
  const drizzle = drizzlePglite(client)
  await migratePglite(drizzle, {
    migrationsFolder: path.join(process.cwd(), 'migrations/pg'),
  })
  console.log('Migrations completed!')
}

beforeAll(async () => {
  await doMigrate()
})

afterAll(async () => {
  const client = getClient()
  await client.end()
})
