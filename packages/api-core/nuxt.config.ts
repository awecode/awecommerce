export default defineNuxtConfig({
  // Sign-in for customers and staff, available to every API layer and app
  extends: ['@awecommerce/auth'],
  runtimeConfig: {
    // Set with NUXT_POSTGRES_URL
    postgresUrl: '',
    public: {
      // The storefront's public address, such as https://shop.example.com
      // (NUXT_PUBLIC_SITE_URL). Order emails link to the order there, also
      // when the backoffice sends them.
      siteUrl: '',
    },
  },
})
