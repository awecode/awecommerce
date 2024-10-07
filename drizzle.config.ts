import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/core/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
})
