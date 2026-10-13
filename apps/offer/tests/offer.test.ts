import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { sql } from 'drizzle-orm'
import { OfferService } from 'apps/offer/services/offer'
import { ProductService } from 'apps/product/services/product'
import {
  offerBenefits,
  offerConditions,
  offerRangeIncludedProducts,
  offerRanges,
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
