import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Same database setup as the store API's tests
    globalSetup: ['../api-store/tests/global-setup.ts'],
    // The first test builds the layer as a Nuxt app
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
})
