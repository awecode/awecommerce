import { PGlite } from '@electric-sql/pglite'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import { Client } from 'pg'

type Database = NodePgDatabase<Record<string, never>> | PgliteDatabase<Record<string, never>>
type DatabaseClient = Client | PGlite

let db: Database
let client: DatabaseClient

if (process.env.NODE_ENV === 'test') {
  client = new PGlite()
  db = drizzlePglite(client)
} else {
  const postgresUrl = process.env.POSTGRES_URL
  if (!postgresUrl) {
    throw new Error('POSTGRES_URL is not set')
  }
  client = new Client({ connectionString: postgresUrl })
  void client.connect()
  db = drizzle(client)
}

export { client, db }
