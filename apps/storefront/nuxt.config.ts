export default defineNuxtConfig({
  extends: ['@awecommerce/api-store'],
  compatibilityDate: '2026-10-14',
  runtimeConfig: {
    public: {
      auth: {
        // The shop is public; pages that need a customer set `auth: true`
        authRequiredByDefault: false,
      },
    },
  },
})
