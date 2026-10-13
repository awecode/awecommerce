import { PGlite, types } from '@electric-sql/pglite'
import { type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import * as tables from '../pg/schema'

import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'

export type PgDatabase =
  | NodePgDatabase<typeof tables>
  | PgliteDatabase<typeof tables>
type PGliteWithEnd = PGlite & { end: () => Promise<void> }

let client: PGliteWithEnd
let pool: pg.Pool
let db: PgDatabase

const initializeDb = () => {
  if (process.env.NODE_ENV === 'test') {
    // Drizzle already JSON-encodes json/jsonb values, so stop PGlite from
    // encoding them a second time (which would store arrays as strings).
    const passEncodedJson = (value: unknown) =>
      typeof value === 'string' ? value : JSON.stringify(value)
    client = new PGlite({
      extensions: { uuid_ossp }
    }) as PGliteWithEnd
    client.serializers[types.JSON] = passEncodedJson
    client.serializers[types.JSONB] = passEncodedJson

    db = drizzlePglite(client,{
      schema: tables
    })
  } else {
    const postgresUrl = process.env.POSTGRES_URL
    if (!postgresUrl) {
      throw new Error('POSTGRES_URL is not set')
    }
    pool = new pg.Pool({
      connectionString: postgresUrl,
    })
    db = drizzle(pool,{
      schema: tables
    })
  }

  if (client instanceof PGlite) {
    (client).end = async () => {
      await (client as PGlite).close()
    }
  }

  return db
}

const getClient = () => {
  return client
}

const closeDb = async () => {
  if (pool) {
    await pool.end()
  }
  if (client) {
    await client.end()
  }
}

export { initializeDb, getClient, closeDb }
