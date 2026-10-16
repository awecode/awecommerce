import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Stripe from 'stripe'

// A stand-in for Stripe's API, enough for Checkout: sessions are created,
// read and expired, refunds made. Each session's page is at its `url`: Pay
// (GET /pay/:id/complete) marks it paid and goes to the success URL; Cancel
// goes to the cancel URL. The server reads it through NUXT_STRIPE_API_BASE.

type Session = {
  id: string
  object: 'checkout.session'
  url: string
  status: 'open' | 'complete' | 'expired'
  payment_status: 'unpaid' | 'paid'
  client_reference_id: string | null
  metadata: Record<string, string>
  amount_total: number
  currency: string
  payment_intent: string | null
  customer_email: string | null
  success_url: string
  cancel_url: string
}

export const WEBHOOK_SECRET = 'whsec_test'

export const startFakeStripe = async () => {
  const sessions = new Map<string, Session>()
  const refunds: { id: string; payment_intent: string }[] = []
  let count = 0
  let base = ''

  // Marks the session paid, for this amount (in Stripe's units) or its own
  const pay = (id: string, amount?: number) => {
    const session = sessions.get(id)!
    Object.assign(session, {
      status: 'complete',
      payment_status: 'paid',
      payment_intent: `pi_${++count}`,
      ...(amount !== undefined ? { amount_total: amount } : {}),
    })
    return session
  }

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const form = new URLSearchParams(Buffer.concat(chunks).toString())
    const path = new URL(req.url!, base).pathname
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const redirect = (to: string) => {
      res.writeHead(302, { location: to })
      res.end()
    }

    if (req.method === 'POST' && path === '/v1/checkout/sessions') {
      const id = `cs_test_${++count}`
      const session: Session = {
        id,
        object: 'checkout.session',
        url: `${base}/pay/${id}`,
        status: 'open',
        payment_status: 'unpaid',
        client_reference_id: form.get('client_reference_id'),
        metadata: { orderId: form.get('metadata[orderId]') ?? '' },
        amount_total: Number(form.get('line_items[0][price_data][unit_amount]')) * Number(form.get('line_items[0][quantity]')),
        currency: form.get('line_items[0][price_data][currency]') ?? '',
        payment_intent: null,
        customer_email: form.get('customer_email'),
        success_url: form.get('success_url') ?? '',
        cancel_url: form.get('cancel_url') ?? '',
      }
      sessions.set(id, session)
      return json(200, session)
    }
    const expire = path.match(/^\/v1\/checkout\/sessions\/([^/]+)\/expire$/)
    if (req.method === 'POST' && expire) {
      const session = sessions.get(expire[1]!)
      if (!session) return json(404, { error: { message: 'No such session' } })
      session.status = 'expired'
      return json(200, session)
    }
    const read = path.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)
    if (req.method === 'GET' && read) {
      const session = sessions.get(read[1]!)
      return session ? json(200, session) : json(404, { error: { message: 'No such session' } })
    }
    if (req.method === 'POST' && path === '/v1/refunds') {
      const refund = { id: `re_${++count}`, object: 'refund', payment_intent: form.get('payment_intent')! }
      refunds.push(refund)
      return json(200, refund)
    }
    // The Checkout page
    const page = path.match(/^\/pay\/([^/]+)(\/complete|\/cancel)?$/)
    if (req.method === 'GET' && page && sessions.has(page[1]!)) {
      const session = sessions.get(page[1]!)!
      if (page[2] === '/complete') return redirect(pay(session.id).success_url)
      if (page[2] === '/cancel') return redirect(session.cancel_url)
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(`<h1>Stripe test checkout</h1><a href="/pay/${session.id}/complete">Pay</a> <a href="/pay/${session.id}/cancel">Cancel</a>`)
    }
    json(404, { error: { message: `Not faked: ${req.method} ${path}` } })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  // A signed webhook body and headers, as Stripe sends them
  const webhook = async (type: string, session: Session) => {
    const payload = JSON.stringify({ id: `evt_${++count}`, object: 'event', type, data: { object: session } })
    const signature = await new Stripe('sk_test').webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET })
    return { payload, headers: { 'stripe-signature': signature, 'content-type': 'application/json' } }
  }

  return {
    base,
    sessions,
    refunds,
    pay,
    webhook,
    // The session made for this order, the latest one
    sessionFor: (orderId: number) => [...sessions.values()].filter((s) => s.client_reference_id === String(orderId)).at(-1),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
