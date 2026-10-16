import { defineNuxtConfig } from 'nuxt/config'

// The store and admin APIs with the Thuprai Pay layer, for the tests
export default defineNuxtConfig({
  extends: ['../../../api-store', '../../../api-admin', '../..'],
})
