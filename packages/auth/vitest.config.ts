import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['app/**', 'server/**', 'shared/**'],
      // Vue pages and the email template are not loaded by these node tests
      exclude: ['**/*.vue', '**/*.html'],
    },
  },
})
