// Nepali wallets and banks (eSewa, Khalti, Fonepay, ConnectIPS, NamastePay,
// and cards) on one hosted page, through Thuprai Pay (pay.awecode.com), as the
// `thuprai_pay` payment method. Add this layer to both apps, list
// `thuprai_pay` in NUXT_PAYMENT_METHODS, and set the keys. Thuprai Pay sends
// webhooks to /api/store/payments/thuprai_pay/webhook.
//
// It does not extend api-core itself (registerPaymentProvider comes from it):
// the apps already have it through api-store and api-admin, and a second path
// to it would load the auth layer's config twice.
export default defineNuxtConfig({
  runtimeConfig: {
    thupraiPay: {
      // NUXT_THUPRAI_PAY_API_KEY: the merchant API key, ps_...
      apiKey: '',
      // NUXT_THUPRAI_PAY_WEBHOOK_SECRET: the webhook signing secret
      webhookSecret: '',
      // NUXT_THUPRAI_PAY_API_BASE: https://ps-stg.awecode.workers.dev for the
      // sandbox. Empty for the live service, https://pay.awecode.com.
      apiBase: '',
      // NUXT_THUPRAI_PAY_LABEL and NUXT_THUPRAI_PAY_DESCRIPTION: what buyers
      // see at checkout
      label: 'Thuprai Pay',
      description: 'Pay with a Nepali wallet or bank',
    },
  },
})
