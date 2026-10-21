export default defineNuxtConfig({
  // The payment providers, so their orders show their method (and card
  // payments can be refunded through Stripe)
  extends: ['@awecommerce/api-admin', '@awecommerce/payment-stripe', '@awecommerce/payment-thuprai-pay'],
  modules: ['@nuxt/ui', '@pinia/nuxt', '@pinia/colada-nuxt', '@nuxt/image'],
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
  // Beside the storefront, which takes 3000. Matches BETTER_AUTH_URL in .env.example.
  devServer: { port: 3001 },
  // Staff-only app, no need for server rendering
  ssr: false,
  // Inter is bundled with the app (see main.css), not fetched from a font service
  fonts: {
    providers: { google: false, bunny: false, fontshare: false, fontsource: false, adobe: false },
  },
})
