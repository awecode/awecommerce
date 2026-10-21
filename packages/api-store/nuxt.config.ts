export default defineNuxtConfig({
  extends: ['@awecommerce/api-core'],
  runtimeConfig: {
    // The storefront is served at its site URL, so sign-in uses
    // NUXT_PUBLIC_SITE_URL when BETTER_AUTH_URL is not set
    auth: { baseURLFromSiteURL: true },
    // How many products each featured category's row on the home page shows
    // (NUXT_HOME_CATEGORY_ROW_SIZE)
    homeCategoryRowSize: 4,
  },
})
