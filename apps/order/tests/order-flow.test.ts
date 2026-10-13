import { beforeAll, expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { carts } from 'apps/cart/schemas'
import { orderLines, orders, orderStatusChanges, paymentEvents } from 'apps/order/schemas'

const orderService = new OrderService(db)
const productService = new ProductService(db)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let productCount = 0
const createProduct = async (price = '100', discountedPrice?: string) => {
  productCount++
  const slug = `order-flow-product-${productCount}`
  return await productService.create({
    name: `Order Flow Product ${productCount}`,
    slug,
    sku: slug,
    price,
    discountedPrice,
  })
}

const createOrder = async (userId: string, cartId?: number) => {
  const product = await createProduct()
  return await orderService.create({ userId, cartId }, [
    {
      id: 0,
      cartId: cartId ?? 0,
      productId: product.id,
      quantity: 2,
      createdAt: null,
      updatedAt: null,
      product: { price: product.price! },
    },
  ])
}

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

test('should create an order with lines, discount, hash, frozen cart and log', async () => {
  const userId = 'flow-create-user'
  const cart = await new CartService(db).create(userId)
  const product = await createProduct('100', '80')
  const order = await orderService.create({ userId, cartId: cart.id }, [
    {
      id: 0,
      cartId: cart.id,
      productId: product.id,
      quantity: 3,
      createdAt: null,
      updatedAt: null,
      product: { price: '100', discountedPrice: '80' },
    },
  ])

  expect(order.status).toBe('Pending')
  expect(order.paymentStatus).toBe('Pending')
  expect(order.lines).toHaveLength(1)
  expect(order.lines[0].quantity).toBe(3)
  expect(Number(order.lines[0].price)).toBe(100)
  expect(Number(order.lines[0].discount)).toBe(20)
  expect(order.lines[0].product.name).toBe(product.name)
  expect(orderService.checkHash(order.id.toString(), order.hash)).toBe(true)

  const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
  expect(cartAfter.status).toBe('Frozen')

  const logs = await orderService.getLogs(order.id)
  expect(logs.map((l) => [l.log, l.loggedBy])).toEqual([['Order received', userId]])
})

test('should change status and record who changed it', async () => {
  const order = await createOrder('flow-status-user')
  await orderService.changeStatus(order.id, 'Pending', 'Confirmed', 'admin-1')
  await orderService.changeStatus(order.id, 'Confirmed', 'Shipped', 'admin-2')

  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.status).toBe('Shipped')

  const changes = await db
    .select()
    .from(orderStatusChanges)
    .where(eq(orderStatusChanges.orderId, order.id))
  expect(
    changes.map((c) => [c.previousStatus, c.newStatus, c.createdBy]),
  ).toEqual([
    ['Pending', 'Confirmed', 'admin-1'],
    ['Confirmed', 'Shipped', 'admin-2'],
  ])

  const logs = await orderService.getLogs(order.id)
  expect(logs.map((l) => [l.log, l.loggedBy])).toEqual([
    ['Order received', 'flow-status-user'],
    ['Order confirmed', 'admin-1'],
    ['Order shipped', 'admin-2'],
  ])
})

test('should cancel an order with reason and a single cancel log', async () => {
  const order = await createOrder('flow-cancel-user')
  await orderService.cancel(order.id, 'Pending', 'admin-1', 'Out of stock', 'Restock in May')

  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.status).toBe('Cancelled')
  expect(orderAfter.cancelledBy).toBe('admin-1')
  expect(orderAfter.cancellationReason).toBe('Out of stock')
  expect(orderAfter.cancellationRemarks).toBe('Restock in May')
  expect(orderAfter.cancelledAt).not.toBeNull()

  const logs = await orderService.getLogs(order.id)
  expect(logs.filter((l) => l.log === 'Order cancelled')).toHaveLength(1)
})

test('should get an order, scoped to its user', async () => {
  const order = await createOrder('flow-get-user')
  const found = await orderService.get(order.id)
  expect(found!.id).toBe(order.id)
  expect(found!.lines).toHaveLength(1)
  expect(found!.lines[0].product.id).toBe(order.lines[0].productId)

  expect((await orderService.get(order.id, 'flow-get-user'))!.id).toBe(order.id)
  expect(await orderService.get(order.id, 'someone-else')).toBeNull()
  expect(await orderService.get(999999)).toBeNull()
})

test('should get an order by a valid hash only', async () => {
  const order = await createOrder('flow-hash-user')
  expect((await orderService.getByHash(order.id, order.hash))!.id).toBe(order.id)
  expect(await orderService.getByHash(order.id, 'wrong-hash')).toBeNull()
  const other = await createOrder('flow-hash-user')
  expect(await orderService.getByHash(other.id, order.hash)).toBeNull()
})

test('should list orders with filters and pagination', async () => {
  const userId = 'flow-list-user'
  const pending = await createOrder(userId)
  await sleep(5)
  const shipped = await createOrder(userId)
  await orderService.changeStatus(shipped.id, 'Pending', 'Shipped')
  await sleep(5)
  const cancelled = await createOrder(userId)
  await orderService.cancel(cancelled.id, 'Pending', 'admin', 'reason')
  await sleep(5)
  const completed = await createOrder(userId)
  await orderService.changeStatus(completed.id, 'Pending', 'Completed')
  await orderService.changePaymentStatus(completed.id, 'Paid')
  await createOrder('flow-list-other-user')

  const ids = (rows: { id: number }[]) => rows.map((o) => o.id).sort((a, b) => a - b)
  const list = async (filters: Parameters<OrderService['list']>[0]) =>
    (await orderService.list({ userId, ...filters })) as { id: number }[]

  expect(ids(await list({}))).toEqual(
    ids([pending, shipped, cancelled, completed]),
  )
  expect(ids(await list({ status: 'Shipped' }))).toEqual([shipped.id])
  expect(ids(await list({ tab: 'Active' }))).toEqual(ids([pending, shipped]))
  expect(ids(await list({ tab: 'Inactive' }))).toEqual(ids([cancelled, completed]))
  expect(ids(await list({ tab: 'Cancelled' }))).toEqual([cancelled.id])
  expect(ids(await list({ paymentStatus: 'Paid' }))).toEqual([completed.id])
  expect(ids(await list({ q: pending.id.toString() }))).toEqual([pending.id])
  expect(
    ids((await orderService.list({ q: 'flow-list-other-user' })) as { id: number }[]),
  ).toHaveLength(1)

  const page1 = (await orderService.list({
    userId,
    pagination: { page: 1, size: 3 },
  })) as { results: { id: number }[]; pagination: Record<string, number> }
  expect(page1.pagination).toEqual({ page: 1, size: 3, total: 4, pages: 2 })
  expect(page1.results.map((o) => o.id)).toEqual([completed.id, cancelled.id, shipped.id])
  const page2 = (await orderService.list({
    userId,
    pagination: { page: 2, size: 3 },
  })) as { results: { id: number }[] }
  expect(page2.results.map((o) => o.id)).toEqual([pending.id])
})

test('should record payment events and update payment status', async () => {
  const userId = 'flow-payment-user'
  const order = await createOrder(userId)
  await orderService.createPaymentEvent({ orderId: order.id, amount: '200', type: 'Paid' })
  let [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.paymentStatus).toBe('Paid')

  await sleep(5)
  await orderService.createPaymentEvent({ orderId: order.id, amount: '50', type: 'Refund' })
  ;[orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.paymentStatus).toBe('Refunded')

  const last = await orderService.getLastPaymentEvent(order.id)
  expect(last.type).toBe('Refund')
  expect(Number(last.amount)).toBe(50)

  const other = await createOrder('flow-payment-other-user')
  await orderService.createPaymentEvent({ orderId: other.id, amount: '10' })

  const byOrder = await orderService.listPaymentEvents({
    orderId: order.id,
    pagination: { page: 1, size: 10 },
  })
  expect(byOrder.results.map((e) => e.type)).toEqual(['Refund', 'Paid'])
  expect(byOrder.pagination).toEqual({ page: 1, size: 10, total: 2, pages: 1 })

  const byUser = await orderService.listPaymentEvents({
    userId,
    pagination: { page: 1, size: 1 },
  })
  expect(byUser.results).toHaveLength(1)
  expect(byUser.pagination).toEqual({ page: 1, size: 1, total: 2, pages: 2 })
})

test('should create, update and list transactions', async () => {
  const userId = 'flow-transaction-user'
  const order = await createOrder(userId)
  const first = await orderService.createTransaction({
    orderId: order.id,
    gateway: 'stripe',
    amount: '200',
  })
  expect(first.status).toBe('Requested')
  await sleep(5)
  const second = await orderService.createTransaction({
    orderId: order.id,
    gateway: 'stripe',
    amount: '200',
  })
  await orderService.updateTransactionStatus(second.id, 'Success')
  const withoutOrder = await orderService.createTransaction({ gateway: 'manual', amount: '5' })

  const byOrder = await orderService.listTransactions({
    orderId: order.id,
    pagination: { page: 1, size: 10 },
  })
  expect(byOrder.results.map((t) => [t.id, t.status])).toEqual([
    [second.id, 'Success'],
    [first.id, 'Requested'],
  ])
  expect(byOrder.results[0].order!.id).toBe(order.id)
  expect(byOrder.pagination.total).toBe(2)

  const successful = await orderService.listTransactions({
    userId,
    status: 'Success',
    pagination: { page: 1, size: 10 },
  })
  expect(successful.results.map((t) => t.id)).toEqual([second.id])

  const all = await orderService.listTransactions({ pagination: { page: 1, size: 50 } })
  expect(all.results.map((t) => t.id)).toContain(withoutOrder.id)
})

test('should report orders containing a product and delete orders with their lines', async () => {
  const order = await createOrder('flow-delete-user')
  const productId = order.lines[0].productId
  expect(await orderService.hasOrderWithProductId(productId)).toBe(true)

  await orderService.delete(order.id)
  expect(await orderService.get(order.id)).toBeNull()
  expect(
    await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)),
  ).toEqual([])
  expect(await orderService.hasOrderWithProductId(productId)).toBe(false)
})

test('should roll back a payment event when updating the payment status fails', async () => {
  const order = await createOrder('flow-payment-rollback-user')
  const spy = vi
    .spyOn(OrderService.prototype, 'changePaymentStatus')
    .mockRejectedValueOnce(new Error('status update failed'))
  await expect(
    orderService.createPaymentEvent({ orderId: order.id, amount: '200', type: 'Paid' }),
  ).rejects.toThrow('status update failed')
  spy.mockRestore()

  expect(
    await db.select().from(paymentEvents).where(eq(paymentEvents.orderId, order.id)),
  ).toEqual([])
  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.paymentStatus).toBe('Pending')
})
