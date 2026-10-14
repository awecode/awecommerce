import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// POSTGRES_URL from the environment, or from .env in this folder
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

// The auth tables (users, sessions, accounts, verifications). They live in the
// same database as the library's tables but keep their own migrations, recorded
// in their own table, so the two sets never interfere.
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.POSTGRES_URL! },
  migrations: { table: '__drizzle_migrations_auth' },
})
