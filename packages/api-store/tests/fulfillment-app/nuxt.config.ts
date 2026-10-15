import { defineNuxtConfig } from 'nuxt/config'

// The layer with the test fulfilment hooks, for the fulfilment tests
export default defineNuxtConfig({
  extends: ['../..', '../../../api-core/tests/fulfillment-hooks'],
})
