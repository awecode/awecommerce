import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '@awecommerce/service/core/db/pg/schema'

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
