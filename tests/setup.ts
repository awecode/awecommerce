import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import path from 'path'
import { beforeAll } from 'vitest'
import { client } from '../core/db/pg/db'

const doMigrate = async () => {
  const drizzle = drizzlePglite(client)
  await migratePglite(drizzle, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  })
}

beforeAll(async () => {
  await doMigrate()
})
