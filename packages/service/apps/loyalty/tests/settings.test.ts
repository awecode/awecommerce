import { expect, test } from 'vitest'

import { db } from 'core/db'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { loyaltySettings } from 'apps/loyalty/schemas'

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
