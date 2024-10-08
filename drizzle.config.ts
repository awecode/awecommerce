import { defineConfig } from 'drizzle-kit'

// export default defineConfig({
//   schema: './src/core/db/pg/schema.ts',
//   out: './migrations/pg',
//   dialect: 'postgresql',
// })

export default defineConfig({
  schema: './src/core/db/sqlite/schema.ts',
  out: './migrations/sqlite',
  dialect: 'sqlite',
})
