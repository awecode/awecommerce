import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migrateSqlite } from 'drizzle-orm/libsql/migrator'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import { getClient } from '../core/db/pg/db'
import { db } from '../core/db'

import { dialect, type dialectType } from '../config'
import { type LibSQLDatabase } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'

const doMigrate = async () => {
  console.log('Running migrations for ', dialect, ' ...')
  if (dialect === 'pg') {
    const client = getClient()
    const drizzle = drizzlePglite(client)
    await migratePglite(drizzle, {
      migrationsFolder: path.join(process.cwd(), 'migrations/pg'),
    })
  } else {
    await migrateSqlite(db, {
      migrationsFolder: path.join(process.cwd(), 'migrations/sqlite'),
    })
  }
  console.log('Migrations for ', dialect, ' completed!')
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
