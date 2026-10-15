import { expect, test } from 'vitest'

import { db } from 'core/db'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { loyaltyPoints, loyaltySettings } from 'apps/loyalty/schemas'
import { eq } from 'drizzle-orm'

const loyaltyService = new LoyaltyService(db)

// Runs first in this file, so the settings table starts empty.
test('should create a single settings row when first read concurrently', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => loyaltyService.getSettings()),
  )
  expect(await db.select().from(loyaltySettings)).toHaveLength(1)
  for (const settings of results) {
    expect(settings).not.toHaveProperty('id')
    expect(settings.isEnabled).toBe(false)
  }
})

test('should keep a single settings row when updated concurrently', async () => {
  await Promise.all([
    loyaltyService.updateSettings({ isEnabled: true, earnRate: '0.1' }),
    loyaltyService.updateSettings({ redeemRate: '2' }),
  ])
  const rows = await db.select().from(loyaltySettings)
  expect(rows).toHaveLength(1)
  const settings = await loyaltyService.getSettings()
  expect(settings.isEnabled).toBe(true)
  expect(Number(settings.earnRate)).toBe(0.1)
  expect(Number(settings.redeemRate)).toBe(2)
})

test('points earned while an expiry is set expire that many days later; without one, never', async () => {
  const service = new LoyaltyService(db)
  await service.updateSettings({ isEnabled: true, earnRate: '1', expiresAfterInDays: 30 })
  await service.addLoyaltyPoint('expiry-user', 1, 10)
  await service.updateSettings({ expiresAfterInDays: null })
  await service.addLoyaltyPoint('expiry-user', 2, 10)

  const rows = await db.select().from(loyaltyPoints).where(eq(loyaltyPoints.userId, 'expiry-user'))
  const byOrder = new Map(rows.map((row) => [row.orderId, row.expiresAt]))
  const days = Math.round((new Date(byOrder.get(1)!).getTime() - Date.now()) / 86_400_000)
  expect(days).toBe(30)
  expect(byOrder.get(2)).toBeNull()
})
