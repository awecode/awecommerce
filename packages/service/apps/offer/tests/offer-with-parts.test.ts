// Offers saved with their range, condition and benefit together, as the
// backoffice's offer form does
import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OfferBenefitService, OfferConditionService, OfferRangeService, OfferService } from 'apps/offer/services/offer'
import { offerBenefits, offerConditions, offerRanges } from 'apps/offer/schemas'
import { BrandService, CategoryService } from 'apps/product/services/product'

let count = 0
const unique = (name: string) => `${name}-${++count}`
const service = new OfferService(db)

const base = () => ({
  name: unique('Summer sale'),
  type: 'site' as const,
  products: { all: true },
  condition: { type: 'basket_quantity' as const, value: '1' },
  benefit: { type: 'percentage' as const, value: '20' },
})

test('creates an offer with its parts, and shows it back the way the form edits it', async () => {
  const shirts = await new CategoryService(db).create({ name: unique('Shirts'), slug: unique('shirts') })
  const acme = await new BrandService(db).create({ name: unique('Acme'), slug: unique('acme') })
  const offer = await service.createWithParts({
    ...base(),
    products: { all: false, categories: [shirts.id], except: { brands: [acme.id] } },
    benefit: { type: 'fixed_amount', value: '5', maxAffectedItems: 2 },
  })

  const shown = await service.getWithParts(offer.id)
  expect(shown).toMatchObject({
    name: offer.name,
    condition: { type: 'basket_quantity', value: '1' },
    benefit: { type: 'fixed_amount', name: offer.name, maxAffectedItems: 2 },
    products: {
      all: false,
      categories: [{ id: shirts.id, name: shirts.name }],
      products: [],
      except: { brands: [{ id: acme.id, name: acme.name }], products: [] },
    },
  })
  expect(Number(shown!.benefit.value)).toBe(5)
  expect((await service.getWithParts(offer.id + 999999))).toBeNull()

  const everything = await service.createWithParts(base())
  expect((await service.getWithParts(everything.id))!.products).toMatchObject({ all: true, categories: [] })
})

test('a voucher needs its code, as with the part routes', async () => {
  await expect(service.createWithParts({ ...base(), type: 'voucher' })).rejects.toThrow('A voucher needs a voucher code')
})

test('updates the offer and its parts', async () => {
  const offer = await service.createWithParts(base())
  const acme = await new BrandService(db).create({ name: unique('Acme'), slug: unique('acme') })
  await service.updateWithParts(offer.id, {
    name: 'Renamed',
    products: { all: false, brands: [acme.id] },
    condition: { type: 'basket_total', value: '50' },
    benefit: { type: 'free_shipping', value: '0' },
  })
  const shown = (await service.getWithParts(offer.id))!
  expect(shown).toMatchObject({
    name: 'Renamed',
    condition: { type: 'basket_total', id: offer.conditionId },
    benefit: { type: 'free_shipping', name: 'Renamed', id: offer.benefitId },
    products: { all: false, brands: [{ id: acme.id }] },
  })
  // Only the offer's own fields
  await service.updateWithParts(offer.id, { priority: 3 })
  expect((await service.getWithParts(offer.id))!).toMatchObject({ priority: 3, benefit: { type: 'free_shipping' } })
})

test('a part another offer uses is copied on update and kept on delete', async () => {
  const range = await new OfferRangeService(db).create({ name: unique('range'), includeAllProducts: true, inclusiveFilter: true, includeAllBrands: true, includeAllCategories: true, includeAllProductClasses: true })
  const condition = await new OfferConditionService(db).create({ rangeId: range.id, type: 'basket_quantity', value: '1' })
  const benefit = await new OfferBenefitService(db).create({ name: unique('benefit'), type: 'percentage', value: '10' })
  const first = await service.create({ name: unique('first'), type: 'site', conditionId: condition.id, benefitId: benefit.id })
  const second = await service.create({ name: unique('second'), type: 'site', conditionId: condition.id, benefitId: benefit.id })

  const updated = await service.updateWithParts(second.id, { products: { all: false, products: [] }, benefit: { type: 'percentage', value: '30' } })
  expect(updated.conditionId).not.toBe(condition.id)
  expect(updated.benefitId).not.toBe(benefit.id)
  const firstShown = (await service.getWithParts(first.id))!
  expect(Number(firstShown.benefit.value)).toBe(10)
  expect(firstShown.products!.all).toBe(true)

  await service.createWithParts(base())
  const third = await service.create({ name: unique('third'), type: 'site', conditionId: condition.id, benefitId: benefit.id })
  await service.deleteWithParts(third.id)
  expect(await db.select().from(offerBenefits).where(eq(offerBenefits.id, benefit.id))).toHaveLength(1)
  expect(await db.select().from(offerConditions).where(eq(offerConditions.id, condition.id))).toHaveLength(1)
})

test('deleting an offer deletes its own parts', async () => {
  const offer = await service.createWithParts(base())
  const [condition] = await db.select().from(offerConditions).where(eq(offerConditions.id, offer.conditionId))
  await service.deleteWithParts(offer.id)
  expect(await db.select().from(offerConditions).where(eq(offerConditions.id, offer.conditionId))).toEqual([])
  expect(await db.select().from(offerBenefits).where(eq(offerBenefits.id, offer.benefitId))).toEqual([])
  expect(await db.select().from(offerRanges).where(eq(offerRanges.id, condition.rangeId))).toEqual([])
  await expect(service.deleteWithParts(offer.id)).rejects.toThrow(`Offer not found: ${offer.id}`)
})

test('a range the form cannot show has no products, and is left alone on update', async () => {
  const range = await new OfferRangeService(db).create({ name: unique('range'), inclusiveFilter: true, includeAllProducts: true })
  const condition = await new OfferConditionService(db).create({ rangeId: range.id, type: 'basket_quantity', value: '1' })
  const benefit = await new OfferBenefitService(db).create({ name: unique('benefit'), type: 'percentage', value: '10' })
  const offer = await service.create({ name: unique('custom'), type: 'site', conditionId: condition.id, benefitId: benefit.id })
  expect((await service.getWithParts(offer.id))!.products).toBeNull()
  await service.updateWithParts(offer.id, { name: 'Still custom' })
  expect((await new OfferRangeService(db).get(range.id))!.includeAllBrands).toBe(false)
})

test('lists offers by state, with their benefit and condition', async () => {
  const day = 86_400_000
  const running = await service.createWithParts({ ...base(), name: unique('state-offer') })
  const scheduled = await service.createWithParts({ ...base(), name: unique('state-offer'), startDate: new Date(Date.now() + day).toISOString() })
  const ended = await service.createWithParts({ ...base(), name: unique('state-offer'), endDate: new Date(Date.now() - day).toISOString() })
  const ids = async (state: 'running' | 'scheduled' | 'ended') =>
    (await service.list({ q: 'state-offer', state })).map((offer) => offer.id)

  expect(await ids('running')).toEqual([running.id])
  expect(await ids('scheduled')).toEqual([scheduled.id])
  expect(await ids('ended')).toEqual([ended.id])
  expect((await service.list({ q: running.name }))[0]).toMatchObject({ benefit: { type: 'percentage' }, condition: { type: 'basket_quantity' } })
})
