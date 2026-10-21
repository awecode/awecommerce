export default defineNuxtConfig({
  // Payment providers: each is offered once its id is in NUXT_PAYMENT_METHODS
  // and its keys are set (stripe for cards, thuprai_pay for Nepali wallets
  // and banks)
  extends: ['@awecommerce/api-store', '@awecommerce/payment-stripe', '@awecommerce/payment-thuprai-pay'],
  modules: ['@nuxt/ui', '@nuxt/image'],
  image: {
    // Images are resized only when IMAGE_PROVIDER=cloudflare is set at build
    // time: Cloudflare's image transformations, on the zone the app is served
    // from (turn them on for the zone, and allow the bucket's host as a
    // source). Otherwise images are shown as stored.
    provider: process.env.IMAGE_PROVIDER === 'cloudflare' ? 'cloudflare' : 'none',
    cloudflare: { baseURL: '/' },
    quality: 75,
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-14',
  // Light only: the editorial theme is designed on warm white
  ui: { colorMode: false },
  // Inter and Fraunces are bundled with the app (see main.css), not fetched
  // from a font service
  fonts: {
    providers: { google: false, bunny: false, fontshare: false, fontsource: false, adobe: false },
  },
  runtimeConfig: {
    public: {
      // The shop's public address, for canonical links and sharing previews,
      // such as https://shop.example.com. Without it, the request's own
      // address is used.
      siteUrl: '',
      // A Google Analytics 4 measurement id, such as G-XXXXXXXXXX
      // (NUXT_PUBLIC_GOOGLE_ANALYTICS_ID). Pages are tracked only when set.
      googleAnalyticsId: '',
      auth: {
        // The shop is public; pages that need a customer set `auth: true`
        authRequiredByDefault: false,
      },
    },
  },
})
