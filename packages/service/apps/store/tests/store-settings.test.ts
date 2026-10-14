import { expect, test } from 'vitest'

import { db } from 'core/db'
import { ValidationError } from 'core/errors'
import { StoreSettingsService } from 'apps/store/services/store'

const settings = new StoreSettingsService(db)

test('starts with USD in en-US', async () => {
  expect(await settings.getSettings()).toEqual({ name: '', currency: 'USD', locale: 'en-US' })
})

test('changes only the given settings, in their standard form', async () => {
  const updated = await settings.updateSettings({ name: 'Awe Store', currency: 'npr', locale: 'en-np' })

  expect(updated).toEqual({ name: 'Awe Store', currency: 'NPR', locale: 'en-NP' })
  expect(await settings.updateSettings({ name: 'Renamed' })).toEqual({
    name: 'Renamed',
    currency: 'NPR',
    locale: 'en-NP',
  })
})

test('refuses an unknown currency or locale', async () => {
  await expect(settings.updateSettings({ currency: 'ZZZ' })).rejects.toThrow(
    new ValidationError('Unknown currency: ZZZ'),
  )
  await expect(settings.updateSettings({ locale: 'not a locale' })).rejects.toThrow(
    new ValidationError('Unknown locale: not a locale'),
  )
})
