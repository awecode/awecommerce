import { expect, test } from 'vitest'

import { db } from 'core/db'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { loyaltyPoints } from 'apps/loyalty/schemas'
import { eq } from 'drizzle-orm'

const loyaltyService = new LoyaltyService(db)

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

test('should count only unexpired points as redeemable', async () => {
  const userId = 'loyalty-user-1'
  await db.insert(loyaltyPoints).values([
    { userId, orderId: 1, earnedPoints: '100' },
    { userId, orderId: 2, earnedPoints: '50', expiresAt: daysFromNow(10) },
    { userId, orderId: 3, earnedPoints: '30', expiresAt: daysFromNow(-1) },
  ])
  expect(await loyaltyService.getTotalRedeemablePoints(userId)).toBe(150)
})

test('should not redeem from expired points', async () => {
  const userId = 'loyalty-user-2'
  const [expired] = await db
    .insert(loyaltyPoints)
    .values({ userId, orderId: 1, earnedPoints: '100', expiresAt: daysFromNow(-1) })
    .returning()
  const [valid] = await db
    .insert(loyaltyPoints)
    .values({ userId, orderId: 2, earnedPoints: '100' })
    .returning()
  await loyaltyService.redeemPoints(userId, 3, 40)
  const rows = await db
    .select()
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.userId, userId))
  expect(Number(rows.find((r) => r.id === expired.id)!.redeemedPoints)).toBe(0)
  expect(Number(rows.find((r) => r.id === valid.id)!.redeemedPoints)).toBe(40)
})

test('should reject redeeming more points than available', async () => {
  const userId = 'loyalty-user-3'
  await db.insert(loyaltyPoints).values({ userId, orderId: 1, earnedPoints: '50' })
  await expect(loyaltyService.redeemPoints(userId, 2, 80)).rejects.toThrow(
    'Insufficient loyalty points',
  )
  const [row] = await db
    .select()
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.userId, userId))
  expect(Number(row.redeemedPoints)).toBe(0)
  expect(await loyaltyService.getLogs(userId)).toEqual([])
})
