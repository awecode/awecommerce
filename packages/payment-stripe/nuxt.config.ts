// Card payments through Stripe Checkout, as the `stripe` payment method. Add
// this layer to both apps (the storefront takes payments, the backoffice
// refunds them), list `stripe` in NUXT_PAYMENT_METHODS, and set the keys.
// Stripe sends webhooks to /api/store/payments/stripe/webhook; subscribe it to
// checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed and checkout.session.expired.
export default defineNuxtConfig({
  extends: ['@awecommerce/api-core'],
  runtimeConfig: {
    stripe: {
      // NUXT_STRIPE_SECRET_KEY: sk_test_... or sk_live_...
      secretKey: '',
      // NUXT_STRIPE_WEBHOOK_SECRET: the endpoint's signing secret, whsec_...
      webhookSecret: '',
      // NUXT_STRIPE_LABEL: what buyers see the method as
      label: 'Card',
      // NUXT_STRIPE_API_BASE: another address for Stripe's API, such as a fake
      // one in tests. Empty for Stripe's own.
      apiBase: '',
    },
  },
})
