// Payments a gateway confirms or refunds, and an order's payment method and
// latest online payment try
import { beforeAll, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'
import { CartService } from 'apps/cart/services/cart'
import { ProductClassService, ProductService } from 'apps/product/services/product'
import { orders, paymentEvents } from 'apps/order/schemas'

const orderService = new OrderService(db)

let count = 0
// An order of 2 at 100: a total of 200
const createOrder = async ({ productClassId }: { productClassId?: number } = {}) => {
  const slug = `order-payments-${++count}`
  const product = await new ProductService(db).create({ stockQuantity: 10, status: 'Published', name: slug, slug, sku: slug, price: '100', productClassId })
  const cartService = new CartService(db)
  const cart = await cartService.create(`payments-user-${count}`)
  await cartService.addToCart(cart.id, product.variants[0].id, 2)
  return await orderService.createFromCart(cart.id, { paymentMethod: 'stripe' })
}
const logs = async (orderId: number) => (await orderService.getLogs(orderId)).map((log) => log.log)
const paymentStatus = async (orderId: number) => (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.paymentStatus
const status = async (orderId: number) => (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.status

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

test('a confirmed payment marks the order paid once, however often it is reported', async () => {
  const order = await createOrder()
  expect(order.paymentMethod).toBe('stripe')
  const payment = { amount: '200', reference: 'pi_1', method: 'stripe', label: 'Card' }

  expect(await orderService.recordPayment(order.id, payment)).toBe('paid')
  expect(await orderService.recordPayment(order.id, payment)).toBe('duplicate')
  expect(await paymentStatus(order.id)).toBe('Paid')
  const events = await db.select().from(paymentEvents).where(eq(paymentEvents.orderId, order.id))
  expect(events).toMatchObject([{ type: 'Paid', reference: 'pi_1', metadata: { method: 'stripe' } }])
  expect(Number(events[0]!.amount)).toBe(200)
  expect(await logs(order.id)).toContain('Paid 200 through Card (pi_1)')

  // A second payment for a paid order is kept, not counted again
  expect(await orderService.recordPayment(order.id, { ...payment, reference: 'pi_2' })).toBe('not-marked')
  expect(await logs(order.id)).toContain('Payment of 200 through Card (pi_2) received, not marked paid: the order is already paid')
})

test('paying confirms an order with nothing to ship, and leaves one to ship for staff', async () => {
  const downloads = await new ProductClassService(db).create({ name: 'Payments Download', slug: 'payments-download', requiresShipping: false })
  const digital = await createOrder({ productClassId: downloads.id })
  expect(await orderService.recordPayment(digital.id, { amount: '200', reference: 'pi_digital', method: 'stripe' })).toBe('paid')
  expect(await status(digital.id)).toBe('Confirmed')
  expect(await logs(digital.id)).toContain('Order confirmed')

  const shipped = await createOrder()
  expect(await orderService.recordPayment(shipped.id, { amount: '200', reference: 'pi_shipped', method: 'stripe' })).toBe('paid')
  expect(await status(shipped.id)).toBe('Pending')
})

test('a payment of another amount, or for a cancelled order, is kept but not marked paid', async () => {
  const short = await createOrder()
  expect(await orderService.recordPayment(short.id, { amount: '150', reference: 'pi_short', method: 'stripe' })).toBe('not-marked')
  expect(await paymentStatus(short.id)).toBe('Pending')
  expect(await logs(short.id)).toContain('Payment of 150 through stripe (pi_short) received, not marked paid: the order total is 200')

  const cancelled = await createOrder()
  await orderService.cancel(cancelled.id, 'staff-1', 'Changed my mind')
  expect(await orderService.recordPayment(cancelled.id, { amount: '200', reference: 'pi_late', method: 'stripe' })).toBe('not-marked')
  expect(await logs(cancelled.id)).toContain('Payment of 200 through stripe (pi_late) received, not marked paid: the order is cancelled')
})

test('a refund is recorded and marks the order refunded', async () => {
  const order = await createOrder()
  await orderService.recordPayment(order.id, { amount: '200', reference: 'pi_r', method: 'stripe' })
  await orderService.recordRefund(order.id, { amount: '200', reference: 're_1', method: 'stripe', label: 'Card', refundedBy: 'staff-1' })

  expect(await paymentStatus(order.id)).toBe('Refunded')
  const refund = (await db.select().from(paymentEvents).where(eq(paymentEvents.orderId, order.id))).find((e) => e.type === 'Refund')
  expect(refund).toMatchObject({ reference: 're_1' })
  expect((await orderService.getLogs(order.id)).find((log) => log.log === 'Refunded 200 through Card (re_1)')?.loggedBy).toBe('staff-1')
})

test('the payment method and the latest payment try change, and the rest of the metadata stays', async () => {
  const order = await createOrder()
  await db.update(orders).set({ metadata: { source: 'web' } }).where(eq(orders.id, order.id))
  const paymentTry = { provider: 'stripe', reference: 'cs_1', status: 'open' as const, startedAt: new Date().toISOString() }

  await orderService.updatePayment(order.id, { paymentTry }, 'Payment started with Card')
  let row = await orderService.updatePayment(order.id, { paymentTry: { ...paymentTry, status: 'failed', message: 'Declined' } })
  expect(row.metadata).toEqual({ source: 'web', payment: { ...paymentTry, status: 'failed', message: 'Declined' } })

  row = await orderService.updatePayment(order.id, { paymentMethod: 'cash_on_delivery', paymentTry: null }, 'Payment method changed to Cash on delivery')
  expect(row.paymentMethod).toBe('cash_on_delivery')
  expect(row.metadata).toEqual({ source: 'web' })
  expect(await logs(order.id)).toEqual(expect.arrayContaining(['Payment started with Card', 'Payment method changed to Cash on delivery']))
})
