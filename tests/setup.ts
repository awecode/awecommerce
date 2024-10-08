import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migrateSqlite } from 'drizzle-orm/libsql/migrator'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import { getClient } from '../core/db/pg/db'
import { initializeDb } from '../core/db/sqlite/db'

import { dialect, type dialectType } from '../config'
import { type LibSQLDatabase } from 'drizzle-orm/libsql'

const doMigrate = async () => {
  if (dialect === 'pg') {
    const client = getClient()
    const drizzle = drizzlePglite(client)
    await migratePglite(drizzle, {
      migrationsFolder: path.join(process.cwd(), 'migrations'),
    })
  } else {
    const db = initializeDb() as unknown as LibSQLDatabase
    await migrateSqlite(db, {
      migrationsFolder: path.join(process.cwd(), 'migrations'),
    })
  }
}

beforeAll(async () => {
  await doMigrate()
})

afterAll(async () => {
  if (dialect === 'pg') {
    const client = getClient()
    await client.end()
  }
})
