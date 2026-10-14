import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError, ValidationError } from 'core/errors'
import {
  OfferBenefitService,
  OfferConditionService,
  OfferRangeService,
  OfferService,
} from 'apps/offer/services/offer'
import { BrandService, CategoryService, ProductClassService } from 'apps/product/services/product'

let count = 0
const unique = (name: string) => `${name}-${++count}`

const rangeService = new OfferRangeService(db)
const conditionService = new OfferConditionService(db)
const benefitService = new OfferBenefitService(db)
const offerService = new OfferService(db)

const createParts = async () => {
  const range = await rangeService.create({ name: unique('range'), includeAllProducts: true })
  const condition = await conditionService.create({ rangeId: range.id, type: 'basket_quantity', value: '1' })
  const benefit = await benefitService.create({ name: unique('benefit'), type: 'percentage', value: '10' })
  return { range, condition, benefit }
}

test('a range shows its excluded categories, brands and classes', async () => {
  const category = await new CategoryService(db).create({ name: unique('c'), slug: unique('c') })
  const brand = await new BrandService(db).create({ name: unique('b'), slug: unique('b') })
  const productClass = await new ProductClassService(db).create({ name: unique('pc'), slug: unique('pc') })
  const range = await rangeService.create({
    name: unique('range'),
    excludedCategories: [category.id],
    excludedBrands: [brand.id],
    excludedProductClasses: [productClass.id],
  })

  const shown = await rangeService.get(range.id)

  expect(shown?.excludedCategories).toEqual([{ id: category.id, name: category.name }])
  expect(shown?.excludedBrands).toEqual([{ id: brand.id, name: brand.name }])
  expect(shown?.excludedProductClasses).toEqual([{ id: productClass.id, name: productClass.name }])
})

test.each([
  ['range update', () => rangeService.update(999999, { name: 'x' }), 'Offer range not found: 999999'],
  ['range delete', () => rangeService.delete(999999), 'Offer range not found: 999999'],
  ['condition update', () => conditionService.update(999999, { value: '2' }), 'Offer condition not found: 999999'],
  ['condition delete', () => conditionService.delete(999999), 'Offer condition not found: 999999'],
  ['benefit update', () => benefitService.update(999999, { name: 'x' }), 'Offer benefit not found: 999999'],
  ['benefit delete', () => benefitService.delete(999999), 'Offer benefit not found: 999999'],
  ['offer update', () => offerService.update(999999, { name: 'x' }), 'Offer not found: 999999'],
  ['offer delete', () => offerService.delete(999999), 'Offer not found: 999999'],
])('%s throws NotFoundError for a missing record', async (_, call, message) => {
  const error = await call().then(() => undefined, (e) => e)

  expect(error).toBeInstanceOf(NotFoundError)
  expect(error.message).toBe(message)
})

test('delete returns the deleted record', async () => {
  const { range, condition, benefit } = await createParts()
  const offer = await offerService.create({
    name: unique('offer'),
    type: 'user',
    conditionId: condition.id,
    benefitId: benefit.id,
  })

  expect((await offerService.delete(offer.id)).id).toBe(offer.id)
  expect((await benefitService.delete(benefit.id)).id).toBe(benefit.id)
  expect((await conditionService.delete(condition.id)).id).toBe(condition.id)
  expect((await rangeService.delete(range.id)).id).toBe(range.id)
})

test('only vouchers have a voucher code, and every voucher has one', async () => {
  const { condition, benefit } = await createParts()
  const parts = { conditionId: condition.id, benefitId: benefit.id }

  await expect(offerService.create({ name: unique('o'), type: 'voucher', ...parts })).rejects.toThrow(
    new ValidationError('A voucher needs a voucher code'),
  )
  await expect(
    offerService.create({ name: unique('o'), type: 'site', voucherCode: unique('CODE'), ...parts }),
  ).rejects.toThrow(new ValidationError('Only vouchers have a voucher code'))

  const voucher = await offerService.create({ name: unique('o'), type: 'voucher', voucherCode: unique('CODE'), ...parts })
  await expect(offerService.update(voucher.id, { voucherCode: null })).rejects.toThrow(
    'A voucher needs a voucher code',
  )
  await expect(offerService.update(voucher.id, { type: 'user' })).rejects.toThrow(
    'Only vouchers have a voucher code',
  )
  const user = await offerService.update(voucher.id, { type: 'user', voucherCode: null })
  expect(user.type).toBe('user')
})

test('get returns the offer with its condition and benefit', async () => {
  const { range, condition, benefit } = await createParts()
  const offer = await offerService.create({
    name: unique('offer'),
    type: 'site',
    conditionId: condition.id,
    benefitId: benefit.id,
  })

  const shown = await offerService.get(offer.id)

  expect(shown?.condition).toMatchObject({ id: condition.id, rangeId: range.id, type: 'basket_quantity' })
  expect(shown?.benefit).toMatchObject({ id: benefit.id, type: 'percentage' })
})
