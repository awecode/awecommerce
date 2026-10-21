import { fetch } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { paymentEvents } from '@awecommerce/service/apps/order/schemas'
import { buyer, createProduct, setupApi, url } from '../../api-store/tests/helpers'
import { createUser } from '../../api-admin/tests/helpers'
import { API_KEY, startFakeThupraiPay, WEBHOOK_SECRET } from './fake-thuprai-pay'

const shippingAddress = { line1: 'Lakeside', city: 'Pokhara', country: 'Nepal' }
const guestUser = { name: 'Sita', email: 'sita@example.com', phone: '9800000000' }

describe.skipIf(!url)('paying with Thuprai Pay', async () => {
  const thuprai = await startFakeThupraiPay()
  afterAll(() => thuprai.close())
  process.env.NUXT_PAYMENT_METHODS = 'cash_on_delivery,thuprai_pay'
  process.env.NUXT_THUPRAI_PAY_API_KEY = API_KEY
  process.env.NUXT_THUPRAI_PAY_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.NUXT_THUPRAI_PAY_API_BASE = thuprai.base
  // Thuprai Pay takes rupees
  process.env.NUXT_PUBLIC_STORE_CURRENCY = 'NPR'
  afterAll(() => delete process.env.NUXT_PUBLIC_STORE_CURRENCY)
  const db = await setupApi({ rootDir: '../../payment-thuprai-pay/tests/app' })
  const orders = new OrderService(db)

  // A guest who checked out one item at Rs 1250.50 with Thuprai Pay
  const placeOrder = async () => {
    const request = buyer()
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId: await createProduct(db, '1250.50'), quantity: 1 } })
    const { body: summary } = await request('/api/store/cart')
    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: summary.total, shippingAddress, guestUser, paymentMethod: 'thuprai_pay' },
    })
    expect(placed.status).toBe(200)
    return { request, order: placed.body, payment: thuprai.orderFor(placed.body.id)! }
  }
  // Goes through a link on Thuprai Pay's page, then follows its redirect back
  // to the store; returns where the store sends the buyer
  const clickThrough = async (link: string) => {
    const atGateway = await globalThis.fetch(link, { redirect: 'manual' })
    const { pathname, search } = new URL(atGateway.headers.get('location')!)
    const back = await fetch(`${pathname}${search}`, { redirect: 'manual' })
    expect(back.status).toBe(302)
    return back.headers.get('location')
  }
  const orderPage = async (request: ReturnType<typeof buyer>, order: { id: number; hash: string }) =>
    (await request(`/api/store/orders/${order.id}?hash=${encodeURIComponent(order.hash)}`)).body
  const payments = (orderId: number) => db.select().from(paymentEvents).where(eq(paymentEvents.orderId, orderId))
  const sendWebhook = (signed: ReturnType<typeof thuprai.webhook>) =>
    fetch('/api/store/payments/thuprai_pay/webhook', { method: 'POST', headers: signed.headers, body: signed.payload })

  test('checkout offers Thuprai Pay, sends the buyer to pay, and the return marks the order paid', async () => {
    const request = buyer()
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId: await createProduct(db, '10'), quantity: 1 } })
    expect((await request('/api/store/payment-methods')).body).toContainEqual({
      id: 'thuprai_pay',
      label: 'Thuprai Pay',
      description: 'Pay with a Nepali wallet or bank',
      online: true,
    })

    const { request: guest, order, payment } = await placeOrder()
    expect(order.payment.redirectUrl).toBe(`${thuprai.base}/checkout/${payment.id}`)
    expect(payment).toMatchObject({
      amount: 125050,
      currency: 'NPR',
      orderId: String(order.id),
      message: order.lines[0].productName,
      data: { orderId: order.id },
      customer: { email: 'sita@example.com' },
    })
    expect(payment.reference).toMatch(new RegExp(`^${order.id}-`))

    // Thuprai Pay adds ?orderId=&status= to the return link the plain way
    expect(await clickThrough(`${thuprai.base}/checkout/${payment.id}/pay`)).toBe(`/orders/${order.id}?hash=${encodeURIComponent(order.hash)}`)
    const paid = await orderPage(guest, order)
    expect(paid.paymentStatus).toBe('Paid')
    expect(paid.payment).toMatchObject({ canPay: false, method: { id: 'thuprai_pay', label: 'Thuprai Pay' } })
    const [recorded] = await payments(order.id)
    expect(recorded).toMatchObject({ type: 'Paid', reference: payment.transactionId, metadata: { method: 'thuprai_pay', gateway: 'esewa', attempt: payment.id } })
    expect(Number(recorded!.amount)).toBe(1250.5)

    // The webhook for the same payment changes nothing
    expect((await sendWebhook(thuprai.webhook('payment_success', payment))).status).toBe(200)
    expect(await payments(order.id)).toHaveLength(1)
  })

  test('a webhook alone marks the order paid; a wrong signature is refused', async () => {
    const { order, payment } = await placeOrder()
    thuprai.pay(payment.id)
    expect((await sendWebhook(thuprai.webhook('payment_success', payment, 'wrong-secret'))).status).toBe(400)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Pending')
    expect((await sendWebhook(thuprai.webhook('payment_success', payment))).status).toBe(200)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Paid')
  })

  test('a failed payment says so, and Pay now starts a new one for the same order', async () => {
    const { request, order, payment } = await placeOrder()
    await clickThrough(`${thuprai.base}/checkout/${payment.id}/fail`)
    expect((await orderPage(request, order)).payment).toMatchObject({ canPay: true, latestTry: { status: 'failed', message: 'The payment failed' } })

    const again = await request(`/api/store/orders/${order.id}/pay`, { method: 'POST', body: { paymentMethod: 'thuprai_pay', hash: order.hash } })
    const second = thuprai.orderFor(order.id)!
    expect(second.id).not.toBe(payment.id)
    expect(second.reference).not.toBe(payment.reference)
    expect(again.body).toEqual({ redirectUrl: `${thuprai.base}/checkout/${second.id}` })
    await clickThrough(`${thuprai.base}/checkout/${second.id}/pay`)
    expect((await orders.get(order.id))!.paymentStatus).toBe('Paid')
  })

  test('coming back while it is still open closes it as cancelled', async () => {
    const { request, order, payment } = await placeOrder()
    const { pathname, search } = new URL(payment.failureRedirectUrl)
    await fetch(`${pathname}${search}`, { redirect: 'manual' })
    expect(thuprai.orders.get(payment.id)!.status).toBe('Cancelled')
    expect((await orderPage(request, order)).payment.latestTry).toEqual({ status: 'failed', message: 'You cancelled the payment' })
  })

  test('a payment of another amount is kept, but the order is not marked paid', async () => {
    const { order, payment } = await placeOrder()
    thuprai.pay(payment.id, 100000)
    await sendWebhook(thuprai.webhook('payment_success', payment))
    expect((await orders.get(order.id))!.paymentStatus).toBe('Pending')
    expect((await orders.getLogs(order.id)).map((log) => log.log)).toContain(
      `Payment of 1000 through Thuprai Pay (${payment.transactionId}) received, not marked paid: the order total is 1250.5`,
    )
  })

  test('staff see the method, and refund outside Thuprai Pay', async () => {
    const { order, payment } = await placeOrder()
    thuprai.pay(payment.id)
    await sendWebhook(thuprai.webhook('payment_success', payment))
    const staff = buyer()
    staff.signIn(await createUser(db as never, 'admin'))
    expect((await staff(`/api/admin/orders/${order.id}`)).body.payment).toEqual({
      method: { id: 'thuprai_pay', label: 'Thuprai Pay', description: 'Pay with a Nepali wallet or bank', online: true },
      canRefund: false,
    })
    expect((await staff(`/api/admin/orders/${order.id}/refund`, { method: 'POST' })).status).toBe(422)
  })
})
