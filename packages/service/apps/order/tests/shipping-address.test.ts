import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError } from 'core/errors'
import { ShippingAddressService } from 'apps/order/services/shipping-address'

const addresses = new ShippingAddressService(db)

const create = (userId: string, isDefault = false) =>
  addresses.create({ userId, line1: '1 Main St', city: 'Kathmandu', country: 'Nepal', isDefault })

test('a new default address replaces the previous default', async () => {
  const first = await create('address-default-user', true)
  const second = await create('address-default-user', true)

  const all = await addresses.getAll('address-default-user')

  expect(all.find((a) => a.id === first.id)?.isDefault).toBe(false)
  expect(all.find((a) => a.id === second.id)?.isDefault).toBe(true)
  expect((await addresses.getDefault('address-default-user'))?.id).toBe(second.id)
})

test("updating or deleting another user's address throws NotFoundError", async () => {
  const theirs = await create('address-owner')

  await expect(addresses.update('address-intruder', theirs.id, { city: 'Pokhara' })).rejects.toThrow(
    NotFoundError,
  )
  await expect(addresses.delete(theirs.id, 'address-intruder')).rejects.toThrow(NotFoundError)
  expect((await addresses.get('address-owner', theirs.id))?.city).toBe('Kathmandu')
})

test('deletes the user own address and returns it', async () => {
  const mine = await create('address-delete-user')

  const deleted = await addresses.delete(mine.id, 'address-delete-user')

  expect(deleted.id).toBe(mine.id)
  expect(await addresses.getAll('address-delete-user')).toEqual([])
})
