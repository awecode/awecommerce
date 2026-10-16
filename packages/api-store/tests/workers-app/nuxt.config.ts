import { defineNuxtConfig } from 'nuxt/config'

// The store API with every request made to look like a Cloudflare Workers
// request with a Hyperdrive binding, for the Workers database tests
export default defineNuxtConfig({
  extends: ['../..'],
})
