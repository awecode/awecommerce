import { OrderService, type PaymentTry } from '@awecommerce/service/apps/order/services/order'

// The `thuprai_pay` payment method: the buyer pays the order's total on
// Thuprai Pay's page, with the wallet or bank they choose there, and is sent
// back to the store. The payment is confirmed with Thuprai Pay's verify call
// (only `fulfilled: true` counts), on the buyer's return and on its signed
// webhooks. Its API refunds cash sales only, so refunds are made in the wallet
// or bank, and staff mark the order refunded.

type Config = { apiKey: string; webhookSecret: string; apiBase: string; label: string; description: string }
const config = () => useRuntimeConfig().thupraiPay as Config

// Thuprai Pay's order, as verify returns it
type Verified = {
  id: string
  orderId: string | null
  amount: number
  currency: string
  status: string
  fulfilled: boolean
  verificationResult?: string | null
  transactionId: string | null
  gateway: string | null
  gatewayReference: string | null
}

// Amounts are integers in the currency's minor unit: paisa for NPR, cents for USD
const minorUnits = (currency: string) =>
  10 ** (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2)

// What the checkout page says is being paid for: the items, with their
// option values and quantities, cut short to fit Thuprai Pay's limit
const MESSAGE_MAX = 100
const lineLabel = (line: { productName: string; variantTitle: string | null; quantity: number }) => {
  const name = line.variantTitle ? `${line.productName} (${line.variantTitle})` : line.productName
  return line.quantity > 1 ? `${name} × ${line.quantity}` : name
}
const paymentMessage = (order: { lines: { productName: string; variantTitle: string | null; quantity: number }[] }) => {
  const text = order.lines.map(lineLabel).join(', ')
  if (text.length <= MESSAGE_MAX) return text
  const cut = text.slice(0, MESSAGE_MAX - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > MESSAGE_MAX / 2 ? cut.slice(0, at) : cut).trimEnd()}…`
}

const api = async <T>(path: string, body?: unknown): Promise<T> => {
  const { apiBase, apiKey } = config()
  const base = (apiBase || 'https://pay.awecode.com').replace(/\/$/, '')
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`Thuprai Pay ${path}: ${response.status} ${data?.message ?? data?.statusMessage ?? text}`)
  }
  return data as T
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
// The hex HMAC-SHA256 of the raw body, keyed with the secret as UTF-8. Web
// Crypto, so it runs on Node and on Cloudflare Workers alike.
const signature = async (body: string, secret: string) => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
}
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

export default defineNitroPlugin(() => {
  registerPaymentProvider({
    id: 'thuprai_pay',
    label: config().label || 'Thuprai Pay',
    description: config().description || undefined,
    online: true,
    configured: () => Boolean(config().apiKey && config().webhookSecret),

    start: async ({ order, amount, currency, returnUrl, cancelUrl }) => {
      const guest = order.guestUser as { name?: string; email?: string; phone?: string } | null
      const created = await api<{ id: string; checkoutUrl: string | null }>('/api/orders', {
        amount: Math.round(Number(amount) * minorUnits(currency)),
        currency,
        orderId: String(order.id),
        // Unique per payment, so Pay now can start another for the same order
        reference: `${order.id}-${Date.now().toString(36)}`,
        message: paymentMessage(order),
        data: { orderId: order.id },
        ...(guest?.email ? { customer: { name: guest.name, email: guest.email, phone: guest.phone } } : {}),
        successRedirectUrl: returnUrl,
        failureRedirectUrl: cancelUrl,
      })
      if (!created.checkoutUrl) throw new Error(`Thuprai Pay gave no checkout page for order ${order.id}`)
      return { redirectUrl: created.checkoutUrl, reference: created.id }
    },

    check: async ({ order, reference, cancelled }) => {
      const verified = await api<Verified>(`/api/orders/${encodeURIComponent(reference)}/verify`)
      if (verified.orderId !== String(order.id)) {
        throw new Error(`Thuprai Pay order ${reference} is not for order ${order.id}`)
      }
      if (verified.fulfilled && verified.transactionId) {
        return {
          status: 'paid',
          amount: String(verified.amount / minorUnits(verified.currency)),
          reference: verified.transactionId,
          details: { currency: verified.currency, gateway: verified.gateway, gatewayReference: verified.gatewayReference },
        }
      }
      if (verified.status === 'Open') {
        // Back from the failure link while it is still open: close it, so it
        // cannot be paid later (a 409 means it was paid meanwhile)
        if (!cancelled) return { status: 'open' }
        try {
          await api(`/api/orders/${encodeURIComponent(reference)}/cancel`)
          return { status: 'failed', message: 'You cancelled the payment' }
        } catch {
          return { status: 'open' }
        }
      }
      // Paid but not fulfilled yet: Thuprai Pay is still confirming it
      if (verified.status === 'Success') return { status: 'open' }
      // Failed, cancelled or expired
      return { status: 'failed', message: verified.status === 'Failed' ? 'The payment failed' : `The payment is ${verified.status.toLowerCase()}` }
    },

    webhook: async (event) => {
      const body = await readRawBody(event, 'utf8')
      const header = getHeader(event, 'x-webhook-signature') ?? ''
      if (!body || !header.startsWith('sha256=')) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Not a Thuprai Pay webhook' })
      }
      if (!sameText(header.slice('sha256='.length).toLowerCase(), await signature(body, config().webhookSecret))) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'The Thuprai Pay signature does not match' })
      }
      const payload = JSON.parse(body) as { event?: string; orderId?: string }
      if (payload.event !== 'payment_success' && payload.event !== 'payment_failed') return null
      const orderId = Number(payload.orderId)
      if (!Number.isInteger(orderId) || orderId <= 0) return null
      // The webhook names our order, not Thuprai Pay's: check the order's
      // latest try with it
      const order = await new OrderService(useDb()).get(orderId)
      const latest = (order?.metadata as { payment?: PaymentTry } | null)?.payment
      return latest?.provider === 'thuprai_pay' ? { orderId, reference: latest.reference } : null
    },
  })
})
