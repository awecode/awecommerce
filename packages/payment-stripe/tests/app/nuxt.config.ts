import { defineNuxtConfig } from 'nuxt/config'

// The store and admin APIs with the Stripe layer, for the tests
export default defineNuxtConfig({
  extends: ['../../../api-store', '../../../api-admin', '../..'],
})
