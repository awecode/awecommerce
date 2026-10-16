import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Migrates the test database, as for the store API's tests
    globalSetup: ['../api-store/tests/global-setup.ts'],
    // The first test builds the app
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
})
