import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './core/db/pg/schema.ts',
  out: './migrations/pg',
  dialect: 'postgresql',
})
