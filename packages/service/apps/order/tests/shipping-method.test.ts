import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError } from 'core/errors'
import { ShippingMethodService } from 'apps/order/services/shipping-method'

const methods = new ShippingMethodService(db)

test('update and delete throw NotFoundError for a missing method', async () => {
  await expect(methods.update(999999, { price: '5' })).rejects.toThrow(
    new NotFoundError('Shipping method not found: 999999'),
  )
  await expect(methods.delete(999999)).rejects.toThrow(
    new NotFoundError('Shipping method not found: 999999'),
  )
})

test('delete returns the deleted method', async () => {
  const method = await methods.create({ name: 'Courier', price: '10' })

  expect((await methods.delete(method.id)).id).toBe(method.id)
  expect(await methods.get(method.id)).toBeUndefined()
})
