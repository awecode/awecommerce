import type { H3Event } from 'h3'
import { OrderService, type PaymentTry } from '@awecommerce/service/apps/order/services/order'

// Payment providers: the ways a buyer can pay. Offline ones (cash on
// delivery, pay later) only name the method, and staff mark the order paid.
// Online ones send the buyer to a gateway and confirm the payment with it.
//
// A provider is registered from a Nitro plugin, in a layer both apps extend
// (the storefront takes payments, the backoffice refunds them), and switched
// on by listing its id in NUXT_PAYMENT_METHODS, in the order checkout shows
// them:
//
//   export default defineNitroPlugin(() => {
//     registerPaymentProvider({
//       id: 'mygateway',
//       label: 'My gateway',
//       online: true,
//       configured: () => Boolean(useRuntimeConfig().mygateway.secretKey),
//       start: async ({ order, amount, currency, returnUrl, cancelUrl }) => ({ redirectUrl, reference }),
//       check: async ({ order, reference, cancelled }) => ({ status: 'paid', amount, reference: paymentId }),
//       webhook: async (event) => ({ orderId, reference }),
//     })
//   })
//
// The core does the rest: it starts the payment after checkout or from the
// order page's Pay now, records the payment once the gateway confirms it
// (OrderService.recordPayment), and runs the paid fulfilment hooks.

type Order = NonNullable<Awaited<ReturnType<OrderService['get']>>>

// Where the buyer's payment stands at the gateway. `amount` is a decimal
// string in the store's currency; `reference` is the gateway's payment id,
// which the payment is recorded under.
export type PaymentCheck =
  | { status: 'paid'; amount: string; reference: string; details?: Record<string, unknown> }
  | { status: 'failed'; message?: string }
  | { status: 'open' }

export type PaymentProvider = {
  id: string
  // Shown to buyers and staff: "Cash on delivery", "Card"
  label: string
  // Under the label at checkout
  description?: string
  // Takes the money online, through start and check
  online: boolean
  // Whether it can be offered for this order or cart; always, when not given
  available?: (context: PaymentContext) => boolean
  // False when its keys are missing: then it is not offered, and a warning is
  // logged
  configured?: () => boolean
  // Starts a payment of the order's total: where to send the buyer, and the
  // gateway's reference for this payment (to check it later)
  start?: (input: {
    event: H3Event
    order: Order
    amount: string
    currency: string
    returnUrl: string
    cancelUrl: string
  }) => Promise<{ redirectUrl: string; reference: string }>
  // Asks the gateway how the payment with this reference went. `cancelled`:
  // the buyer came back through the cancel link.
  check?: (input: { event: H3Event; order: Order; reference: string; cancelled?: boolean }) => Promise<PaymentCheck>
  // Reads a webhook and checks its signature (throwing when it is wrong):
  // which order and payment reference to check, or null to ignore it
  webhook?: (event: H3Event) => Promise<{ orderId: number; reference: string } | null>
  // Refunds a payment in full: the gateway's refund id
  refund?: (input: { event: H3Event; order: Order; payment: { amount: string; reference: string } }) => Promise<{ reference: string }>
}

export type PaymentContext = {
  // Whether something in the cart or order is shipped
  requiresShipping: boolean
  currency: string
}

export type PaymentMethod = { id: string; label: string; description: string | null; online: boolean }

const providers = new Map<string, PaymentProvider>()

export const registerPaymentProvider = (provider: PaymentProvider): void => {
  providers.set(provider.id, provider)
}

// A registered provider, enabled or not (an order may use one switched off
// since)
export const paymentProvider = (id: string | null | undefined): PaymentProvider | undefined => (id ? providers.get(id) : undefined)

// Whether the order's method takes the money online (a card, a wallet). Such
// an order is confirmed to the buyer once it is paid, not when it is placed.
export const paysOnline = (order: { paymentMethod: string | null }): boolean => Boolean(paymentProvider(order.paymentMethod)?.online)

const warned = new Set<string>()
const warnOnce = (message: string) => {
  if (warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

// The providers NUXT_PAYMENT_METHODS lists, in its order, that are registered
// and have their keys
export const enabledPaymentProviders = (): PaymentProvider[] => {
  const ids = String(useRuntimeConfig().paymentMethods ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.flatMap((id) => {
    const provider = providers.get(id)
    if (!provider) {
      warnOnce(`Payment method ${id} is listed in NUXT_PAYMENT_METHODS, but no provider has that id`)
      return []
    }
    if (provider.configured && !provider.configured()) {
      warnOnce(`Payment method ${id} is not offered: its keys are not set`)
      return []
    }
    return [provider]
  })
}

const view = (provider: PaymentProvider): PaymentMethod => ({
  id: provider.id,
  label: provider.label,
  description: provider.description ?? null,
  online: provider.online,
})

// What a cart or order can be paid with
export const paymentMethodsFor = (context: PaymentContext): PaymentMethod[] =>
  enabledPaymentProviders()
    .filter((provider) => !provider.available || provider.available(context))
    .map(view)

export const storeCurrency = (): string => useRuntimeConfig().public.store.currency

const orderContext = (order: Order): PaymentContext => ({
  requiresShipping: order.lines.some((line) => line.requiresShipping),
  currency: storeCurrency(),
})

// For the order pages: the method, and whether the buyer can pay now (an
// online method, unpaid, not cancelled) with what, and how the latest try went
export const orderPayment = async (order: Order) => {
  const provider = paymentProvider(order.paymentMethod)
  const paymentTry = ((order.metadata as { payment?: PaymentTry } | null)?.payment ?? null) as PaymentTry | null
  const canPay = Boolean(provider?.online) && order.paymentStatus === 'Pending' && order.status !== 'Cancelled'
  return {
    method: provider ? view(provider) : order.paymentMethod ? { id: order.paymentMethod, label: order.paymentMethod, description: null, online: false } : null,
    canPay,
    // Open: we are waiting to hear from the gateway. Failed: with its message.
    latestTry: canPay && paymentTry ? { status: paymentTry.status, message: paymentTry.message ?? null } : null,
    methods: canPay ? paymentMethodsFor(orderContext(order)) : [],
  }
}

// The site the buyer is on, for the gateway's return links
const origin = (event: H3Event) => getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

// Switches the order to this method. An online one starts a payment and
// returns where to send the buyer; an offline one only changes the method.
export const startPayment = async (event: H3Event, order: Order, provider: PaymentProvider): Promise<{ redirectUrl: string | null }> => {
  const orders = new OrderService(useDb())
  if (!provider.online || !provider.start) {
    if (order.paymentMethod !== provider.id) {
      const wasOnline = paysOnline(order)
      await orders.updatePayment(order.id, { paymentMethod: provider.id, paymentTry: null }, `Payment method changed to ${provider.label}`)
      // From paying online to paying later: now it is placed, as at checkout
      if (wasOnline) await sendOrderEmail(event, 'placed', (await orders.get(order.id))!, { requestOrigin: true })
    }
    return { redirectUrl: null }
  }
  const hash = encodeURIComponent(orders.generateHash(String(order.id)))
  const back = `${origin(event)}/api/store/payments/${provider.id}/return?order=${order.id}&hash=${hash}`
  const { redirectUrl, reference } = await provider.start({
    event,
    order,
    amount: order.total,
    currency: storeCurrency(),
    returnUrl: back,
    cancelUrl: `${back}&cancelled=1`,
  })
  await orders.updatePayment(
    order.id,
    { paymentMethod: provider.id, paymentTry: { provider: provider.id, reference, status: 'open', startedAt: new Date().toISOString() } },
    `Payment started with ${provider.label} (${reference})`,
  )
  return { redirectUrl }
}

// Asks the gateway about a payment and acts on it: a paid one is recorded
// (once), runs the paid fulfilment hooks and emails the buyer the confirmed
// order; a failed one marks the order's
// latest try failed, when it is that try. Returns the check.
export const settlePayment = async (event: H3Event, order: Order, provider: PaymentProvider, reference: string, options: { cancelled?: boolean } = {}): Promise<PaymentCheck> => {
  if (!provider.check) return { status: 'open' }
  const result = await provider.check({ event, order, reference, cancelled: options.cancelled })
  const orders = new OrderService(useDb())
  const latest = (order.metadata as { payment?: PaymentTry } | null)?.payment
  const isLatest = latest?.provider === provider.id && latest.reference === reference
  if (result.status === 'paid') {
    const recorded = await orders.recordPayment(order.id, {
      amount: result.amount,
      reference: result.reference,
      method: provider.id,
      label: provider.label,
      metadata: { attempt: reference, ...result.details },
    })
    if (isLatest) await orders.updatePayment(order.id, { paymentTry: null })
    if (recorded === 'paid') {
      await runFulfillment(event, 'paid', order.id)
      await sendOrderEmail(event, 'confirmed', (await orders.get(order.id))!, { requestOrigin: true })
    }
  } else if (result.status === 'failed' && isLatest && latest.status !== 'failed') {
    await orders.updatePayment(
      order.id,
      { paymentTry: { ...latest, status: 'failed', ...(result.message ? { message: result.message } : {}) } },
      `Payment failed with ${provider.label}${result.message ? `: ${result.message}` : ''}`,
    )
  }
  return result
}

// The payment a refund through the order's provider would return: the last
// one it recorded, while the order is paid; undefined when there is none or
// the provider cannot refund
export const refundablePayment = (order: Order): { amount: string; reference: string } | undefined => {
  const provider = paymentProvider(order.paymentMethod)
  if (!provider?.refund || order.paymentStatus !== 'Paid') return undefined
  const payment = order.paymentEvents
    .filter((e) => e.type === 'Paid' && e.reference && (e.metadata as { method?: string } | null)?.method === provider.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return payment ? { amount: payment.amount, reference: payment.reference! } : undefined
}

// For the backoffice: the method (`online`: it takes the money online, so an
// unpaid order is awaiting payment), and whether it can be refunded through
// the provider
export const adminOrderPayment = (order: Order) => {
  const provider = paymentProvider(order.paymentMethod)
  return {
    method: provider ? view(provider) : order.paymentMethod ? { id: order.paymentMethod, label: order.paymentMethod, description: null, online: false } : null,
    canRefund: Boolean(refundablePayment(order)),
  }
}
