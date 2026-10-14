export default defineNuxtConfig({
  extends: ['@awecommerce/api-store'],
  modules: ['@nuxt/ui'],
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
      auth: {
        // The shop is public; pages that need a customer set `auth: true`
        authRequiredByDefault: false,
      },
    },
  },
})
