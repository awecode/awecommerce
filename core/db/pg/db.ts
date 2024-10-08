import { PGlite } from '@electric-sql/pglite'
import { type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'

type Database =
  | NodePgDatabase<Record<string, never>>
  | PgliteDatabase<Record<string, never>>
type PGliteWithEnd = PGlite & { end: () => Promise<void> }

let db: Database
let client: PGliteWithEnd

if (process.env.NODE_ENV === 'test') {
  client = new PGlite() as PGliteWithEnd

  db = drizzlePglite(client)
} else {
  const postgresUrl = process.env.POSTGRES_URL
  if (!postgresUrl) {
    throw new Error('POSTGRES_URL is not set')
  }
  const pool = new Pool({
    connectionString: postgresUrl,
  })
  db = drizzle(pool)
}

// if (client instanceof PGlite) {
//   (client).end = async () => {
//     await (client as PGlite).close()
//   }
// }

export { db, client }
