import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError } from 'core/errors'
import { orders } from 'apps/order/schemas'
import { OrderService } from 'apps/order/services/order'

const orderService = new OrderService(db)

const createOrder = async (values: { userId?: string; guestUser?: Record<string, string> } = {}) => {
  const [order] = await db.insert(orders).values({ total: '10', ...values }).returning()
  return order
}

test('changePaymentStatus updates the order and logs who did it', async () => {
  const order = await createOrder()

  const updated = await orderService.changePaymentStatus(order.id, 'Paid', 'staff-1')

  expect(updated.paymentStatus).toBe('Paid')
  const [stored] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(stored.paymentStatus).toBe('Paid')
  const logs = await orderService.getLogs(order.id)
  expect(logs.map((l) => [l.log, l.loggedBy])).toEqual([['Payment Paid', 'staff-1']])
})

test('changePaymentStatus throws NotFoundError for a missing order', async () => {
  await expect(orderService.changePaymentStatus(999999, 'Paid')).rejects.toThrow(
    new NotFoundError('Order not found: 999999'),
  )
})

test('list finds orders by guest email', async () => {
  const mine = await createOrder({ guestUser: { name: 'Ann', email: 'ann.search@example.com' } })
  await createOrder({ guestUser: { name: 'Bob', email: 'bob.search@example.com' } })

  const found = await orderService.list({ q: 'ANN.search' })

  expect(found.map((o) => o.id)).toEqual([mine.id])
})
