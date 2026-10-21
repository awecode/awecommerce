import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

// A stand-in for Thuprai Pay's merchant API: orders are created (one per
// reference), verified and cancelled. Each order's page is its checkoutUrl:
// Pay marks it paid and goes to the success URL, Fail marks it failed and goes
// to the failure URL, each with ?orderId=&status= added the plain way (a
// second "?"). The server reads it through NUXT_THUPRAI_PAY_API_BASE.

export const API_KEY = 'ps_test_key'
export const WEBHOOK_SECRET = 'thuprai-test-secret'

type Order = {
  id: string
  orderId: string
  reference: string
  amount: number
  currency: string
  status: 'Open' | 'Success' | 'Failed' | 'Cancelled'
  transactionId: string | null
  gateway: string | null
  gatewayReference: string | null
  customer: { name?: string; email?: string } | null
  message: string | null
  data: Record<string, unknown>
  successRedirectUrl: string
  failureRedirectUrl: string
}

export const startFakeThupraiPay = async () => {
  const orders = new Map<string, Order>()
  let count = 0
  let base = ''

  const verified = (order: Order) => ({
    id: order.id,
    orderId: order.orderId,
    reference: order.reference,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    verified: true,
    fulfilled: order.status === 'Success',
    verificationResult: order.status,
    transactionId: order.transactionId,
    gateway: order.gateway,
    gatewayReference: order.gatewayReference,
  })
  // Marks it paid through eSewa, for this amount (in paisa) or its own
  const pay = (id: string, amount?: number) => {
    const order = orders.get(id)!
    Object.assign(order, { status: 'Success', transactionId: `txn_${++count}`, gateway: 'esewa', gatewayReference: `ESW${count}` })
    if (amount !== undefined) order.amount = amount
    return order
  }

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const text = Buffer.concat(chunks).toString()
    const body = text ? JSON.parse(text) : {}
    const path = new URL(req.url!, base).pathname
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    const redirect = (to: string) => {
      res.writeHead(302, { location: to })
      res.end()
    }

    if (path.startsWith('/api/') && req.headers.authorization !== `Bearer ${API_KEY}`) {
      return json(401, { statusCode: 401, statusMessage: 'Unauthorized', message: 'Bad API key' })
    }
    if (req.method === 'POST' && path === '/api/orders') {
      const reference = body.reference ?? body.orderId
      if ([...orders.values()].some((o) => o.reference === reference)) {
        return json(409, { statusCode: 409, statusMessage: 'Order reference already exists for this merchant', message: 'Order reference already exists for this merchant' })
      }
      const order: Order = {
        id: `019f-${++count}`,
        orderId: body.orderId,
        reference,
        amount: body.amount,
        currency: body.currency ?? 'NPR',
        status: 'Open',
        transactionId: null,
        gateway: null,
        gatewayReference: null,
        customer: body.customer ?? null,
        message: body.message ?? null,
        data: body.data ?? {},
        successRedirectUrl: body.successRedirectUrl,
        failureRedirectUrl: body.failureRedirectUrl,
      }
      orders.set(order.id, order)
      return json(200, { id: order.id, reference, checkoutUrl: `${base}/checkout/${order.id}` })
    }
    const action = path.match(/^\/api\/orders\/([^/]+)\/(verify|cancel)$/)
    if (req.method === 'POST' && action) {
      const order = orders.get(action[1]!)
      if (!order) return json(404, { statusCode: 404, statusMessage: 'Not Found', message: 'No such order' })
      if (action[2] === 'cancel') {
        if (order.status !== 'Open') return json(409, { statusCode: 409, statusMessage: 'Conflict', message: 'Order is not open' })
        order.status = 'Cancelled'
      }
      return json(200, verified(order))
    }
    // The checkout page
    const page = path.match(/^\/checkout\/([^/]+)(\/pay|\/fail)?$/)
    if (req.method === 'GET' && page && orders.has(page[1]!)) {
      const order = orders.get(page[1]!)!
      if (page[2] === '/pay') return redirect(`${pay(order.id).successRedirectUrl}?orderId=${order.orderId}&status=Success`)
      if (page[2] === '/fail') {
        order.status = 'Failed'
        return redirect(`${order.failureRedirectUrl}?orderId=${order.orderId}&status=Failed`)
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(`<h1>Thuprai Pay test checkout</h1><a href="/checkout/${order.id}/pay">Pay</a> <a href="/checkout/${order.id}/fail">Fail</a>`)
    }
    json(404, { statusCode: 404, statusMessage: 'Not Found', message: `Not faked: ${req.method} ${path}` })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  // A signed webhook body and headers, as Thuprai Pay sends them
  const webhook = (event: 'payment_success' | 'payment_failed', order: Order, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({
      event,
      orderId: order.orderId,
      transactionId: order.transactionId,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      gateway: order.gateway,
      gatewayReference: order.gatewayReference,
      data: order.data,
      tags: [],
    })
    const signature = createHmac('sha256', secret).update(payload).digest('hex')
    return { payload, headers: { 'content-type': 'application/json', 'x-event-id': `evt-${++count}`, 'x-webhook-signature': `sha256=${signature}` } }
  }

  return {
    base,
    orders,
    pay,
    webhook,
    // The latest order made for this store order
    orderFor: (orderId: number) => [...orders.values()].filter((o) => o.orderId === String(orderId)).at(-1),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
