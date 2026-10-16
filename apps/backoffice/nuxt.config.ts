export default defineNuxtConfig({
  // The payment providers, so their orders show their method (and card
  // payments can be refunded through Stripe)
  extends: ['@awecommerce/api-admin', '@awecommerce/payment-stripe', '@awecommerce/payment-thuprai-pay'],
  modules: ['@nuxt/ui', '@pinia/nuxt', '@pinia/colada-nuxt'],
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
