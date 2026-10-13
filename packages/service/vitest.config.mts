import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Resolve `apps/...` and `core/...` to real paths, so they share one module
    // instance with the relative imports used inside the services
    alias: [
      {
        find: /^(apps|core)\//,
        replacement: fileURLToPath(new URL('./$1/', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    env: loadEnv('', process.cwd(), ''),
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/pg-global-setup.ts'],
  },
})
