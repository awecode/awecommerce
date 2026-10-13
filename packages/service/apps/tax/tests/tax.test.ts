import { expect, test } from 'vitest'

import { db } from 'core/db'
import { TaxService } from 'apps/tax/services/tax'
import { taxSettings } from 'apps/tax/schemas'

const taxService = new TaxService(db)

// Runs first in this file, so the settings table starts empty.
test('should create a single default settings row when first read concurrently', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => taxService.getSettings()),
  )
  expect(await db.select().from(taxSettings)).toHaveLength(1)
  for (const settings of results) {
    expect(settings).not.toHaveProperty('id')
    expect(settings.pricesIncludeTax).toBe(false)
    expect(Number(settings.defaultRate)).toBe(0)
    expect(settings.taxShipping).toBe(false)
  }
})

test('should update settings and keep a single row', async () => {
  await taxService.updateSettings({ defaultRate: '13', taxShipping: true })
  await taxService.updateSettings({ pricesIncludeTax: true })

  expect(await db.select().from(taxSettings)).toHaveLength(1)
  const settings = await taxService.getSettings()
  expect(settings.pricesIncludeTax).toBe(true)
  expect(Number(settings.defaultRate)).toBe(13)
  expect(settings.taxShipping).toBe(true)
})
