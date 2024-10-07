import type { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import path from 'path'
import { beforeAll } from 'vitest'
import { client } from '../src/core/db'

const pgliteClient = client as PGlite

const doMigrate = async () => {
  const drizzle = drizzlePglite(pgliteClient)
  await migratePglite(drizzle, {
    migrationsFolder: path.join(process.cwd(), 'migrations'),
  })
}

beforeAll(async () => {
  await doMigrate()
})
