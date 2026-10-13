import { defineConfig } from 'tsdown'

// Only library code goes into dist: no tests, configs, dev scripts or repo files.
// One .d.ts is shared by import and require, matching the package exports.
export default defineConfig({
  entry: [
    'apps/**/*.ts',
    'core/**/*.ts',
    '!**/*.test.ts',
    '!**/tests/**',
    '!apps/product/seed.ts',
    '!core/db/pg/migrate.ts',
    '!core/db/pg/migrate-pglite.ts',
  ],
  unbundle: true,
  root: '.',
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: true,
  clean: true,
  outDir: 'dist',
  outExtensions: () => ({ dts: '.d.ts' }),
  deps: {
    neverBundle: true,
  },
})
