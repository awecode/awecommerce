import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    // The first test builds the layer as a Nuxt app
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
})
