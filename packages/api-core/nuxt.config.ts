import { fileURLToPath } from 'node:url'

// A Cloudflare Workers build: NITRO_PRESET=cloudflare-module (the apps'
// build:cf), or a Workers Builds run
const cloudflare = Boolean(
  process.env.WORKERS_CI
  || /cloudflare/i.test(process.env.NITRO_PRESET || '')
  || /cloudflare/i.test(process.env.SERVER_PRESET || ''),
)

export default defineNuxtConfig({
  // Sign-in for customers and staff, available to every API layer and app
  extends: ['@awecommerce/auth'],
  experimental: {
    // Old tabs request chunks that a new deploy removed. Reload on any chunk
    // error, not only on route navigation, so lazy components do not end on
    // a 500 page.
    emitRouteChunkError: 'automatic-immediate',
  },
  nitro: {
    // useDb() finds the current request this way, for its own connection on
    // Cloudflare Workers. Works on Node too.
    experimental: { asyncContext: true },
    // pg's optional native driver is never used, and Workers provide
    // cloudflare:sockets, which pg uses there
    rollupConfig: { external: ['pg-native', 'cloudflare:sockets'] },
    // Cloudflare builds (NITRO_PRESET=cloudflare-module) run with Node.js
    // compatibility, which pg and node:crypto need, and write
    // .output/server/wrangler.json (the app's wrangler.jsonc with the built
    // entry and assets), which is what gets deployed
    cloudflare: { nodeCompat: true, deployConfig: true },
    // On Workers, a missing /_nuxt/ file is not cached (see
    // server/cloudflare-entry.ts)
    ...(cloudflare ? { entry: fileURLToPath(new URL('./server/cloudflare-entry.ts', import.meta.url)) } : {}),
  },
  runtimeConfig: {
    // Set with NUXT_POSTGRES_URL. On Cloudflare Workers, a Hyperdrive binding
    // named HYPERDRIVE is used instead when there is one.
    postgresUrl: '',
    // The payment methods buyers can use, in the order checkout shows them:
    // provider ids, comma separated (NUXT_PAYMENT_METHODS), such as
    // cash_on_delivery,pay_later,stripe. None by default: until some are
    // listed, checkout cannot place orders. See server/utils/payments.ts.
    paymentMethods: '',
    // Also offer pay later for digital goods when an online method is offered
    // (NUXT_PAY_LATER_WITH_ONLINE)
    payLaterWithOnline: false,
    // Object storage for images: the backoffice's uploads, and the photos
    // buyers add to their profile on the storefront. An S3-compatible bucket,
    // such as R2 from Node: the endpoint is
    // https://<account>.r2.cloudflarestorage.com and the public URL the
    // bucket's public address. Set with NUXT_S3_*. An R2 binding named R2,
    // when present, is used instead (see server/utils/objectStorage.ts); it
    // still needs the public URL.
    s3: {
      accessKey: '',
      secretKey: '',
      bucketName: '',
      endpointUrl: '',
      region: '',
      publicUrl: '',
    },
    public: {
      // The storefront's public address, such as https://shop.example.com
      // (NUXT_PUBLIC_SITE_URL). Order emails link to the order there, also
      // when the backoffice sends them.
      siteUrl: '',
      // The store's name (NUXT_PUBLIC_STORE_NAME, Awecommerce Store when unset), its currency, an ISO 4217
      // code such as USD that prices are in (NUXT_PUBLIC_STORE_CURRENCY), and
      // its locale, a BCP 47 tag such as en-US for how prices, numbers and
      // dates are written (NUXT_PUBLIC_STORE_LOCALE)
      store: {
        name: 'Awecommerce Store',
        currency: 'USD',
        locale: 'en-US',
      },
    },
  },
})
