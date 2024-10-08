import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

const sqliteUrl = process.env.SQLITE_URL
if (!sqliteUrl) {
  throw new Error('SQLITE_URL is not set')
}

const client = createClient({
  url: sqliteUrl,
})
const db = drizzle(client)
