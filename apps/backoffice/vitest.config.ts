import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Same database setup as the API layers' tests
    globalSetup: ['../../packages/api-store/tests/global-setup.ts'],
    // Each file builds the app and starts a browser. One file at a time, as
    // the settings tests change the store's currency that others check
    // prices against.
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 60_000,
  },
})
