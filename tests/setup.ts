import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import { getClient } from '../core/db/pg/db'

const doMigrate = async () => {
  const client = getClient()
  const drizzle = drizzlePglite(client)
  await migratePglite(drizzle, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  })
}

beforeAll(async () => {
  await doMigrate()
})

afterAll(async () => {
  const client = getClient()
  await client.end()
})
