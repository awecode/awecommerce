// The offline payment methods the base ships with. Like every provider, each
// is offered only when NUXT_PAYMENT_METHODS lists it.
// - cash_on_delivery: for an order with something to ship; the courier
//   collects, and staff mark it paid.
// - pay_later: for an order with nothing to ship (digital goods); the store
//   arranges payment, and staff mark it paid. Not offered once an online
//   method is, unless NUXT_PAY_LATER_WITH_ONLINE=true.
export default defineNitroPlugin(() => {
  registerPaymentProvider({
    id: 'cash_on_delivery',
    label: 'Cash on delivery',
    description: 'Pay the courier when your order arrives.',
    online: false,
    available: ({ requiresShipping }) => requiresShipping,
  })
  registerPaymentProvider({
    id: 'pay_later',
    label: 'Pay later',
    description: 'We will contact you to arrange payment.',
    online: false,
    available: ({ requiresShipping }) =>
      !requiresShipping && (Boolean(useRuntimeConfig().payLaterWithOnline) || !enabledPaymentProviders().some((provider) => provider.online)),
  })
})
