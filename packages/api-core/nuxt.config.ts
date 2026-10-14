export default defineNuxtConfig({
  // Sign-in for customers and staff, available to every API layer and app
  extends: ['@awecommerce/auth'],
  runtimeConfig: {
    // Set with NUXT_POSTGRES_URL
    postgresUrl: '',
  },
})
