export default defineNuxtConfig({
  extends: ['@awecommerce/api-admin'],
  compatibilityDate: '2026-10-14',
  // Staff-only app, no need for server rendering
  ssr: false,
})
