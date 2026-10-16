import Stripe from 'stripe'

// The `stripe` payment method: the buyer pays on a Stripe Checkout page for
// the order's total (one line, "Order 123"), and is sent back to the store.
// The payment is confirmed by reading the Checkout Session from Stripe, on the
// buyer's return and on Stripe's webhooks. Refunds go back to the card.

// Currencies Stripe counts in whole units, and those it counts in thousandths
const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const threeDecimal = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])
const scale = (currency: string) => (zeroDecimal.has(currency) ? 1 : threeDecimal.has(currency) ? 1000 : 100)
// "1250.5" in NPR is 125050; Stripe wants three-decimal amounts in tens
const toStripe = (amount: string, currency: string) => {
  const units = Math.round(Number(amount) * scale(currency))
  return threeDecimal.has(currency) ? Math.round(units / 10) * 10 : units
}
const fromStripe = (amount: number, currency: string) => String(amount / scale(currency.toUpperCase()))

const config = () => useRuntimeConfig().stripe as { secretKey: string; webhookSecret: string; label: string; apiBase: string }

let client: Stripe | undefined
const stripe = () => {
  if (!client) {
    const { secretKey, apiBase } = config()
    const base = apiBase ? new URL(apiBase) : undefined
    client = new Stripe(secretKey, {
      // fetch works on Node and on Cloudflare Workers alike
      httpClient: Stripe.createFetchHttpClient(),
      ...(base ? { host: base.hostname, port: base.port, protocol: base.protocol.replace(':', '') as 'http' | 'https' } : {}),
    })
  }
  return client
}

const paymentIntentId = (session: Stripe.Checkout.Session) =>
  typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? session.id)

export default defineNitroPlugin(() => {
  registerPaymentProvider({
    id: 'stripe',
    label: config().label || 'Card',
    description: 'Pay by card on a secure Stripe page.',
    online: true,
    configured: () => Boolean(config().secretKey && config().webhookSecret),

    start: async ({ order, amount, currency, returnUrl, cancelUrl }) => {
      const email = (order.guestUser as { email?: string } | null)?.email
      const session = await stripe().checkout.sessions.create({
        mode: 'payment',
        client_reference_id: String(order.id),
        metadata: { orderId: String(order.id) },
        ...(email ? { customer_email: email } : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: toStripe(amount, currency.toUpperCase()),
              product_data: { name: `Order ${order.id}` },
            },
          },
        ],
        success_url: returnUrl,
        cancel_url: cancelUrl,
      })
      if (!session.url) throw new Error(`Stripe gave no Checkout page for order ${order.id}`)
      return { redirectUrl: session.url, reference: session.id }
    },

    check: async ({ order, reference, cancelled }) => {
      let session = await stripe().checkout.sessions.retrieve(reference)
      if (session.client_reference_id !== String(order.id)) {
        throw new Error(`Stripe session ${reference} is not for order ${order.id}`)
      }
      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        return {
          status: 'paid',
          amount: fromStripe(session.amount_total ?? 0, session.currency ?? ''),
          reference: paymentIntentId(session),
          details: { currency: session.currency },
        }
      }
      // Back through the cancel link: the page is closed, so it cannot be paid later
      if (cancelled && session.status === 'open') {
        session = await stripe().checkout.sessions.expire(reference)
      }
      if (session.status === 'expired') {
        return { status: 'failed', message: cancelled ? 'You cancelled the payment' : 'The payment page expired' }
      }
      // Complete but unpaid: a bank payment that has not cleared yet
      return { status: 'open' }
    },

    webhook: async (event) => {
      const body = await readRawBody(event, 'utf8')
      const signature = getHeader(event, 'stripe-signature')
      if (!body || !signature) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Not a Stripe webhook' })
      }
      let stripeEvent: Stripe.Event
      try {
        stripeEvent = await stripe().webhooks.constructEventAsync(body, signature, config().webhookSecret, undefined, Stripe.createSubtleCryptoProvider())
      } catch {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'The Stripe signature does not match' })
      }
      if (!stripeEvent.type.startsWith('checkout.session.')) return null
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      const orderId = Number(session.client_reference_id)
      return Number.isInteger(orderId) && orderId > 0 ? { orderId, reference: session.id } : null
    },

    refund: async ({ payment }) => {
      const refund = await stripe().refunds.create({ payment_intent: payment.reference })
      return { reference: refund.id }
    },
  })
})
