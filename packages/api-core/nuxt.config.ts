export default defineNuxtConfig({
  // Sign-in for customers and staff, available to every API layer and app
  extends: ['@awecommerce/auth'],
  nitro: {
    // useDb() finds the current request this way, for its own connection on
    // Cloudflare Workers. Works on Node too.
    experimental: { asyncContext: true },
    // pg's optional native driver is never used, and Workers provide
    // cloudflare:sockets, which pg uses there
    rollupConfig: { external: ['pg-native', 'cloudflare:sockets'] },
    // Cloudflare builds (NITRO_PRESET=cloudflare-module) run with Node.js
    // compatibility, which pg and node:crypto need
    cloudflare: { nodeCompat: true },
  },
  runtimeConfig: {
    // Set with NUXT_POSTGRES_URL. On Cloudflare Workers, a Hyperdrive binding
    // named HYPERDRIVE is used instead when there is one.
    postgresUrl: '',
    public: {
      // The storefront's public address, such as https://shop.example.com
      // (NUXT_PUBLIC_SITE_URL). Order emails link to the order there, also
      // when the backoffice sends them.
      siteUrl: '',
    },
  },
})
