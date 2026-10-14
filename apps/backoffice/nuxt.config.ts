export default defineNuxtConfig({
  extends: ['@awecommerce/api-admin'],
  modules: ['@nuxt/ui', '@pinia/nuxt', '@pinia/colada-nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-14',
  // Staff-only app, no need for server rendering
  ssr: false,
  // Inter is bundled with the app (see main.css), not fetched from a font service
  fonts: {
    providers: { google: false, bunny: false, fontshare: false, fontsource: false, adobe: false },
  },
})
