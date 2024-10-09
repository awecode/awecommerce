import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

const initializeDb = () => {
  const sqliteUrl = process.env.NODE_ENV === 'test' ? 'file::memory:' : process.env.SQLITE_URL
  if (!sqliteUrl) {
    throw new Error('SQLITE_URL is not set')
  }

  const client = createClient({
    url: sqliteUrl,
  })
  console.log('Connected to SQLite database..')
  const db = drizzle(client)

  return db
}

export { initializeDb }
