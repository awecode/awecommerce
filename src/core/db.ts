import { PGlite } from '@electric-sql/pglite'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import { Client } from 'pg'

let db:
  | NodePgDatabase<Record<string, never>>
  | PgliteDatabase<Record<string, never>>
let client: Client | PGlite

if (process.env.NODE_ENV === 'test') {
  client = new PGlite()
  db = drizzlePglite(client)
} else {
  console.log(process.env.POSTGRES_URL)

  client = new Client({
    connectionString: process.env.POSTGRES_URL,
  })

  client.connect()
  db = drizzle(client)
}

export { client, db }

