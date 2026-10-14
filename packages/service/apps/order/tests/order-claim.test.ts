import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { orders } from 'apps/order/schemas'
import { OrderService } from 'apps/order/services/order'

const orderService = new OrderService(db)

const createOrder = async (values: { userId?: string; guestUser?: Record<string, string> }) => {
  const [order] = await db.insert(orders).values({ total: '10', ...values }).returning()
  return order
}

const ownerOf = async (orderId: number) =>
  (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.userId

test('claimGuestOrders gives a user the guest orders placed with their email', async () => {
  const mine = await createOrder({ guestUser: { name: 'Ann', email: 'Ann@Example.com' } })
  const alsoMine = await createOrder({ guestUser: { name: 'Ann', email: 'ann@example.com' } })
  const someoneElse = await createOrder({ guestUser: { name: 'Bob', email: 'bob@example.com' } })
  const alreadyOwned = await createOrder({ userId: 'other-user', guestUser: { email: 'ann@example.com' } })
  const noDetails = await createOrder({})

  const claimed = await orderService.claimGuestOrders('ann-user', 'ANN@example.com')

  expect(claimed.sort()).toEqual([mine.id, alsoMine.id].sort())
  expect(await ownerOf(mine.id)).toBe('ann-user')
  expect(await ownerOf(alsoMine.id)).toBe('ann-user')
  expect(await ownerOf(someoneElse.id)).toBeNull()
  expect(await ownerOf(alreadyOwned.id)).toBe('other-user')
  expect(await ownerOf(noDetails.id)).toBeNull()
  // Nothing left to claim
  expect(await orderService.claimGuestOrders('ann-user', 'ann@example.com')).toEqual([])
})
