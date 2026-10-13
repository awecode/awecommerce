import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { and, eq, sql } from 'drizzle-orm'
import { OfferRangeService, OfferService } from 'apps/offer/services/offer'
import { ProductService } from 'apps/product/services/product'
import {
  offerBenefits,
  offerConditions,
  offerRangeIncludedProducts,
  offerRanges,
  offerUsages,
  offers,
} from 'apps/offer/schemas'

const offerService = new OfferService(db)
const productService = new ProductService(db)

const allowedUser = "o'brien"
const injectedUserId = "x' = 'x' OR 'a"
// PGlite double-encodes jsonb params under drizzle 0.38, so cast explicitly.
const includedUserIds = sql`${JSON.stringify([allowedUser])}::text::jsonb`

let productId: number
let userOfferId: number
let voucherOfferId: number
let conditionId: number
let benefitId: number

beforeAll(async () => {
  const product = await productService.create({
    name: 'Offer Product',
    slug: 'offer-product',
    sku: 'offer-product',
    price: '100',
  })
  productId = product.id
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: 'Range',
      inclusiveFilter: true,
      includeAllBrands: true,
      includeAllCategories: true,
      includeAllProductClasses: true,
    })
    .returning()
  await db
    .insert(offerRangeIncludedProducts)
    .values({ rangeId: range.id, productId })
  const [condition] = await db
    .insert(offerConditions)
    .values({ rangeId: range.id, type: 'basket_quantity', value: '1' })
    .returning()
  const [benefit] = await db
    .insert(offerBenefits)
    .values({ name: 'Benefit', type: 'percentage', value: '10' })
    .returning()
  conditionId = condition.id
  benefitId = benefit.id
  const [userOffer] = await db
    .insert(offers)
    .values({
      name: 'User Offer',
      type: 'user',
      includedUserIds: includedUserIds,
      conditionId: condition.id,
      benefitId: benefit.id,
    })
    .returning()
  userOfferId = userOffer.id
  const [voucherOffer] = await db
    .insert(offers)
    .values({
      name: 'Voucher Offer',
      type: 'voucher',
      voucherCode: 'VOUCHER',
      includedUserIds: includedUserIds,
      conditionId: condition.id,
      benefitId: benefit.id,
    })
    .returning()
  voucherOfferId = voucherOffer.id
})

test('should return user-restricted offers to the included user', async () => {
  const ids = (rows: { id: number }[]) => rows.map((r) => r.id)
  expect(ids(await offerService.getActiveUserOffers(allowedUser))).toEqual([userOfferId])
  expect(
    ids(await offerService.getActiveApplicableUserOffers(allowedUser, [productId])),
  ).toEqual([userOfferId])
  expect(
    ids(await offerService.getActiveApplicableVoucherOffers(allowedUser, [productId])),
  ).toEqual([voucherOfferId])
  expect(
    await offerService.getActiveUserOfferDetails(allowedUser, userOfferId),
  ).toBeTruthy()
})

test('should not leak user-restricted offers through a crafted userId', async () => {
  expect(await offerService.getActiveUserOffers(injectedUserId)).toEqual([])
  expect(
    await offerService.getActiveApplicableUserOffers(injectedUserId, [productId]),
  ).toEqual([])
  expect(
    await offerService.getActiveApplicableVoucherOffers(injectedUserId, [productId]),
  ).toEqual([])
  expect(
    await offerService.getActiveUserOfferDetails(injectedUserId, userOfferId),
  ).toBeFalsy()
})

test('should roll back offer range creation when an included product fails', async () => {
  await expect(
    new OfferRangeService(db).create({
      name: 'Rollback Range',
      includedProducts: [999999],
    }),
  ).rejects.toThrow()
  expect(
    await db.select().from(offerRanges).where(eq(offerRanges.name, 'Rollback Range')),
  ).toEqual([])
})

const createUsageOffer = async (name: string) => {
  const [offer] = await db
    .insert(offers)
    .values({ name, type: 'user', includeAllUsers: true, conditionId, benefitId })
    .returning()
  return offer.id
}

const getUsageCounts = async (offerId: number, userId: string) => {
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId))
  const [usage] = await db
    .select()
    .from(offerUsages)
    .where(and(eq(offerUsages.offerId, offerId), eq(offerUsages.userId, userId)))
  return { total: offer.usageCount, user: usage?.usageCount ?? null }
}

test('should decrease both the user and the offer usage counts', async () => {
  const offerId = await createUsageOffer('Usage Offer 1')
  await offerService.increaseUsage(offerId, 'usage-user')
  await offerService.increaseUsage(offerId, 'usage-user')
  await offerService.decreaseUsage(offerId, 'usage-user')
  expect(await getUsageCounts(offerId, 'usage-user')).toEqual({ total: 1, user: 1 })
})

test('should not decrease usage below zero or for a user without usage', async () => {
  const offerId = await createUsageOffer('Usage Offer 2')
  await offerService.increaseUsage(offerId, 'usage-user-a')
  await offerService.decreaseUsage(offerId, 'usage-user-b')
  expect(await getUsageCounts(offerId, 'usage-user-a')).toEqual({ total: 1, user: 1 })

  await offerService.decreaseUsage(offerId, 'usage-user-a')
  await offerService.decreaseUsage(offerId, 'usage-user-a')
  expect(await getUsageCounts(offerId, 'usage-user-a')).toEqual({ total: 0, user: 0 })
})

test('should increase usage for new and existing users', async () => {
  const offerId = await createUsageOffer('Usage Offer 3')
  await offerService.increaseUsage(offerId, 'usage-user')
  expect(await getUsageCounts(offerId, 'usage-user')).toEqual({ total: 1, user: 1 })
  await offerService.increaseUsage(offerId, 'usage-user')
  expect(await getUsageCounts(offerId, 'usage-user')).toEqual({ total: 2, user: 2 })
})

test('should increase usage for multiple offers', async () => {
  const usedOfferId = await createUsageOffer('Usage Offer 4')
  const newOfferId = await createUsageOffer('Usage Offer 5')
  await offerService.increaseUsage(usedOfferId, 'usage-user')
  await offerService.increaseUsageMultiple(
    [usedOfferId, newOfferId, newOfferId],
    'usage-user',
  )
  expect(await getUsageCounts(usedOfferId, 'usage-user')).toEqual({ total: 2, user: 2 })
  expect(await getUsageCounts(newOfferId, 'usage-user')).toEqual({ total: 1, user: 1 })
  await expect(offerService.increaseUsageMultiple([], 'usage-user')).resolves.not.toThrow()
})
