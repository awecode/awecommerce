import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as librarySchema from '@awecommerce/service/core/db/pg/schema'
import * as authSchema from '../../../auth/server/db/schema'

// The library's tables and the auth layer's (users, sessions, ...), which
// Better Auth's Drizzle adapter looks up here
const schema = { ...librarySchema, ...authSchema }

let pool: pg.Pool | undefined
let db: ReturnType<typeof drizzle<typeof schema>> | undefined

// One pool per server, opened on first use
export const useDb = () => {
  if (!db) {
    const { postgresUrl } = useRuntimeConfig()
    if (!postgresUrl) {
      throw new Error('NUXT_POSTGRES_URL is not set')
    }
    pool = new pg.Pool({ connectionString: postgresUrl })
    db = drizzle(pool, { schema })
  }
  return db
}

export const closeDb = async () => {
  await pool?.end()
  pool = undefined
  db = undefined
}
