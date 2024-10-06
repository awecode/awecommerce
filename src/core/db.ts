import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

console.log(process.env.POSTGRES_URL)

export const client = new Client({
  connectionString: process.env.POSTGRES_URL,
})

client.connect()
export const db = drizzle(client)