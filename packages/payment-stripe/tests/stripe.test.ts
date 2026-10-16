import { fetch } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { paymentEvents } from '@awecommerce/service/apps/order/schemas'
import { productClasses } from '@awecommerce/service/apps/product/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { buyer, createProduct, setupApi, unique, url } from '../../api-store/tests/helpers'
import { createUser } from '../../api-admin/tests/helpers'
import { startFakeStripe, WEBHOOK_SECRET } from './fake-stripe'

const shippingAddress = { line1: '1 Main St', city: 'Pokhara', country: 'Nepal' }
const guestUser = { name: 'Guest', email: 'guest@example.com' }

describe.skipIf(!url)('paying with Stripe', async () => {
  const stripe = await startFakeStripe()
  afterAll(() => stripe.close())
  process.env.NUXT_PAYMENT_METHODS = 'cash_on_delivery,pay_later,stripe'
  process.env.NUXT_STRIPE_SECRET_KEY = 'sk_test_fake'
  process.env.NUXT_STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.NUXT_STRIPE_API_BASE = stripe.base
  const db = await setupApi({ rootDir: '../../payment-stripe/tests/app' })
  await new StoreSettingsService(db).updateSettings({ currency: 'USD' })
  const orders = new OrderService(db)

  // A guest who checked out one item at 25 with Stripe
  const placeOrder = async () => {
    const request = buyer()
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId: await createProduct(db, '25'), quantity: 1 } })
    const { body: summary } = await request('/api/store/cart')
    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: summary.total, shippingAddress, guestUser, paymentMethod: 'stripe' },
    })
    expect(placed.status).toBe(200)
    return { request, order: placed.body, session: stripe.sessionFor(placed.body.id)! }
  }
  // Follows a link back from Stripe; returns where the store sends the buyer
  const back = async (link: string) => {
    const { pathname, search } = new URL(link)
    const response = await fetch(`${pathname}${search}`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    return response.headers.get('location')
  }
  const orderPage = async (request: ReturnType<typeof buyer>, order: { id: number; hash: string }) =>
    (await request(`/api/store/orders/${order.id}?hash=${encodeURIComponent(order.hash)}`)).body
  const sendWebhook = async (type: string, session: Parameters<typeof stripe.webhook>[1]) => {
    const { payload, headers } = await stripe.webhook(type, session)
    return await fetch('/api/store/payments/stripe/webhook', { method: 'POST', headers, body: payload })
  }
  const payments = (orderId: number) => db.select().from(paymentEvents).where(eq(paymentEvents.orderId, orderId))

  test('checkout offers Stripe, sends the buyer to pay, and the return marks the order paid', async () => {
    const request = buyer()
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId: await createProduct(db, '10'), quantity: 1 } })
    expect((await request('/api/store/payment-methods')).body.map((m: { id: string }) => m.id)).toEqual(['cash_on_delivery', 'stripe'])
    // With nothing to ship, pay later is not offered next to an online method
    const [download] = await db.insert(productClasses).values({ name: unique('download'), slug: unique('download'), requiresShipping: false, trackStock: false }).returning()
    const digital = buyer()
    const ebook = unique('ebook')
    const product = await new ProductService(db).create({ name: ebook, slug: ebook, sku: ebook, price: '5', stockQuantity: 0, status: 'Published', productClassId: download!.id })
    await digital('/api/store/cart/lines', { method: 'POST', body: { variantId: product.variants[0]!.id, quantity: 1 } })
    expect((await digital('/api/store/payment-methods')).body.map((m: { id: string }) => m.id)).toEqual(['stripe'])

    const { request: guest, order, session } = await placeOrder()
    expect(order.paymentMethod).toBe('stripe')
    expect(order.payment.redirectUrl).toBe(session.url)
    expect(session).toMatchObject({ amount_total: 2500, currency: 'usd', customer_email: 'guest@example.com', client_reference_id: String(order.id) })
    expect((await orderPage(guest, order)).payment).toMatchObject({ canPay: true, latestTry: { status: 'open' } })

    stripe.pay(session.id)
    expect(await back(session.success_url)).toBe(`/orders/${order.id}?hash=${encodeURIComponent(order.hash)}`)
    const paid = await orderPage(guest, order)
    expect(paid.paymentStatus).toBe('Paid')
    expect(paid.payment).toMatchObject({ canPay: false, latestTry: null })
    const [payment] = await payments(order.id)
    expect(payment).toMatchObject({ type: 'Paid', reference: session.payment_intent, metadata: { method: 'stripe', attempt: session.id } })

    // Stripe's webhook for the same payment changes nothing
    expect((await sendWebhook('checkout.session.completed', session)).status).toBe(200)
    expect(await payments(order.id)).toHaveLength(1)
  })

  test('a webhook alone marks the order paid; a wrong signature is refused', async () => {
    const { order, session } = await placeOrder()
    const paid = stripe.pay(session.id)
    const { payload, headers } = await stripe.webhook('checkout.session.completed', paid)
    const forged = await fetch('/api/store/payments/stripe/webhook', { method: 'POST', headers: { ...headers, 'stripe-signature': 't=1,v1=bad' }, body: payload })
    expect(forged.status).toBe(400)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Pending')

    expect((await sendWebhook('checkout.session.completed', paid)).status).toBe(200)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Paid')
  })

  test('a cancelled payment fails; Pay now starts another, or switches to cash on delivery', async () => {
    const { request, order, session } = await placeOrder()
    await back(session.cancel_url)
    expect(stripe.sessions.get(session.id)!.status).toBe('expired')
    const failed = (await orderPage(request, order)).payment
    expect(failed).toMatchObject({ canPay: true, latestTry: { status: 'failed', message: 'You cancelled the payment' } })
    expect(failed.methods.map((m: { id: string }) => m.id)).toEqual(['cash_on_delivery', 'stripe'])

    const again = await request(`/api/store/orders/${order.id}/pay`, { method: 'POST', body: { paymentMethod: 'stripe', hash: order.hash } })
    const second = stripe.sessionFor(order.id)!
    expect(second.id).not.toBe(session.id)
    expect(again.body).toEqual({ redirectUrl: second.url })
    expect((await orderPage(request, order)).payment.latestTry).toEqual({ status: 'open', message: null })

    const cash = await request(`/api/store/orders/${order.id}/pay`, { method: 'POST', body: { paymentMethod: 'cash_on_delivery', hash: order.hash } })
    expect(cash.body).toEqual({ redirectUrl: null })
    const switched = await orderPage(request, order)
    expect(switched.paymentMethod).toBe('cash_on_delivery')
    expect(switched.payment).toMatchObject({ canPay: false, method: { id: 'cash_on_delivery', label: 'Cash on delivery' } })
    // Nothing more to pay online
    expect((await request(`/api/store/orders/${order.id}/pay`, { method: 'POST', body: { paymentMethod: 'stripe', hash: order.hash } })).status).toBe(422)
  })

  test('the order page checks a payment the buyer did not come back from', async () => {
    const { request, order, session } = await placeOrder()
    stripe.pay(session.id)
    const checked = await request(`/api/store/orders/${order.id}/payment-check`, { method: 'POST', body: { hash: order.hash } })
    expect(checked.body).toMatchObject({ canPay: false })
    expect((await orders.get(order.id))!.paymentStatus).toBe('Paid')
  })

  test('a payment of another amount is kept, but the order is not marked paid', async () => {
    const { order, session } = await placeOrder()
    stripe.pay(session.id, 1000)
    await back(session.success_url)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Pending')
    expect(await payments(order.id)).toHaveLength(1)
    expect((await orders.getLogs(order.id)).map((log) => log.log)).toContain(
      `Payment of 10 through Card (${stripe.sessions.get(session.id)!.payment_intent}) received, not marked paid: the order total is 25`,
    )
  })

  test('staff refund a card payment through Stripe', async () => {
    const { order, session } = await placeOrder()
    stripe.pay(session.id)
    await back(session.success_url)
    const staff = buyer()
    staff.signIn(await createUser(db as never, 'admin'))
    expect((await staff(`/api/admin/orders/${order.id}`)).body.payment).toEqual({
      method: { id: 'stripe', label: 'Card', description: expect.any(String), online: true },
      canRefund: true,
    })

    const refunded = await staff(`/api/admin/orders/${order.id}/refund`, { method: 'POST' })
    expect(refunded.status).toBe(200)
    expect(refunded.body.paymentStatus).toBe('Refunded')
    expect(stripe.refunds.at(-1)!.payment_intent).toBe(stripe.sessions.get(session.id)!.payment_intent)
    expect((await payments(order.id)).map((p) => p.type).sort()).toEqual(['Paid', 'Refund'])
    expect((await staff(`/api/admin/orders/${order.id}`)).body.payment.canRefund).toBe(false)
  })
})
