// Offers for members of a plan, and offers that do not combine with others
import { beforeAll, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { MembershipService } from 'apps/membership/services/membership'
import { memberships } from 'apps/membership/schemas'
import { OfferService } from 'apps/offer/services/offer'
import { OrderService } from 'apps/order/services/order'
import { ProductService } from 'apps/product/services/product'
import {
  offerBenefits,
  offerConditions,
  offerRangeIncludedProducts,
  offerRanges,
  offers,
} from 'apps/offer/schemas'

const cartService = new CartService(db)
const membershipService = new MembershipService(db)

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createProduct = async (price = '100') => {
  const slug = unique('members-product')
  return await new ProductService(db).create({ stockQuantity: 1000, status: 'Published', name: slug, slug, sku: slug, price })
}

// A percentage offer on one product
const createOffer = async (options: {
  productId: number
  percent: string
  type?: 'site' | 'user' | 'voucher'
  planIds?: number[]
  everyone?: boolean
  combines?: boolean
  minQuantity?: string
}) => {
  const name = unique('Offer')
  const [range] = await db
    .insert(offerRanges)
    .values({ name, inclusiveFilter: true, includeAllBrands: true, includeAllCategories: true, includeAllProductClasses: true })
    .returning()
  await db.insert(offerRangeIncludedProducts).values({ rangeId: range.id, productId: options.productId })
  const [condition] = await db.insert(offerConditions).values({ rangeId: range.id, type: 'basket_quantity', value: options.minQuantity ?? '1' }).returning()
  const [benefit] = await db.insert(offerBenefits).values({ name, type: 'percentage', value: options.percent }).returning()
  const type = options.type ?? 'user'
  const [offer] = await db
    .insert(offers)
    .values({
      name,
      type,
      voucherCode: type === 'voucher' ? name.toUpperCase() : undefined,
      includeAllUsers: options.everyone ?? false,
      includedMembershipPlanIds: options.planIds ?? [],
      combinesWithOtherOffers: options.combines ?? true,
      conditionId: condition.id,
      benefitId: benefit.id,
    })
    .returning()
  return offer
}

const plan = async () => {
  const program = unique('music')
  return await membershipService.createPlan({ name: unique('Platinum'), slug: unique('platinum'), program, rank: 1 })
}

const cartOf = async (userId: string | undefined, variantId: number) => {
  const cart = await cartService.create(userId)
  await cartService.addToCart(cart.id, variantId, 1)
  return cart
}
const discount = async (sessionId: string) => Number((await cartService.getCartSummary(sessionId)).totalOfferDiscount)
const applyVoucher = async (sessionId: string, code: string, userId: string) =>
  await new OfferService(db).applyVoucherCode(await cartService.getCartContentForSession(sessionId, true), undefined, code, userId)

test('a member offer is for active members of its plans only', async () => {
  const platinum = await plan()
  const other = await plan()
  const product = await createProduct()
  await createOffer({ productId: product.id, percent: '20', planIds: [platinum.id] })
  const member = unique('member')
  const otherMember = unique('member')
  const membership = await membershipService.grant({ userId: member, planId: platinum.id, months: 12 })
  await membershipService.grant({ userId: otherMember, planId: other.id, months: 12 })

  const memberCart = await cartOf(member, product.variants[0].id)
  expect(await discount(memberCart.sessionId)).toBe(20)
  expect((await cartService.getCartSummary(memberCart.sessionId)).userOfferDiscounts.map((d) => d.discount)).toEqual([20])
  expect(await discount((await cartOf(otherMember, product.variants[0].id)).sessionId)).toBe(0)
  expect(await discount((await cartOf(unique('stranger'), product.variants[0].id)).sessionId)).toBe(0)
  expect(await discount((await cartOf(undefined, product.variants[0].id)).sessionId)).toBe(0)

  // Ended: the next read drops it
  await db.update(memberships).set({ endsAt: new Date(Date.now() - 1000).toISOString() }).where(eq(memberships.id, membership.id))
  expect(await discount(memberCart.sessionId)).toBe(0)
})

test('a voucher for a plan works for its members only', async () => {
  const platinum = await plan()
  const product = await createProduct()
  const voucher = await createOffer({ productId: product.id, percent: '15', type: 'voucher', planIds: [platinum.id] })
  const member = unique('member')
  await membershipService.grant({ userId: member, planId: platinum.id, months: 1 })

  const stranger = unique('stranger')
  const strangerCart = await cartOf(stranger, product.variants[0].id)
  await expect(applyVoucher(strangerCart.sessionId, voucher.voucherCode!, stranger)).rejects.toThrow('Invalid voucher code')
  const memberCart = await cartOf(member, product.variants[0].id)
  await applyVoucher(memberCart.sessionId, voucher.voucherCode!, member)
  expect(await discount(memberCart.sessionId)).toBe(15)
})

test('offers that combine add up; one that does not wins only when it gives more', async () => {
  const userId = unique('shopper')
  const product = await createProduct()
  await createOffer({ productId: product.id, percent: '10', everyone: true })
  await createOffer({ productId: product.id, percent: '20', everyone: true })
  const cart = await cartOf(userId, product.variants[0].id)
  expect(await discount(cart.sessionId)).toBe(30)

  // 25% alone is less than 30% together
  await createOffer({ productId: product.id, percent: '25', type: 'site', combines: false })
  expect(await discount(cart.sessionId)).toBe(30)

  // 40% alone is more: it is the only one applied
  const big = await createOffer({ productId: product.id, percent: '40', everyone: true, combines: false })
  const summary = await cartService.getCartSummary(cart.sessionId)
  expect(Number(summary.totalOfferDiscount)).toBe(40)
  expect([...summary.siteOfferDiscounts, ...summary.userOfferDiscounts].map((d) => d.id)).toEqual([big.id])
})

test('a voucher that loses to a bigger discount stays on the cart, gives nothing and is not used up', async () => {
  const platinum = await plan()
  const product = await createProduct()
  const memberOffer = await createOffer({ productId: product.id, percent: '20', planIds: [platinum.id] })
  const small = await createOffer({ productId: product.id, percent: '15', type: 'voucher', everyone: true, combines: false })
  const userId = unique('member')
  await membershipService.grant({ userId, planId: platinum.id, months: 1 })
  const cart = await cartOf(userId, product.variants[0].id)

  await applyVoucher(cart.sessionId, small.voucherCode!, userId)
  const summary = await cartService.getCartSummary(cart.sessionId)
  expect(Number(summary.totalOfferDiscount)).toBe(20)
  expect(summary.voucherOfferDiscounts).toEqual([])
  expect(summary.notCombinedVoucherOffers).toEqual([{ id: small.id, name: small.name, voucherCode: small.voucherCode }])

  // Checkout goes through with the member offer, and the voucher is not used
  const order = await new OrderService(db).createFromCart(cart.id, { expectedTotal: summary.total })
  expect((order.offers as { id: number }[]).map((offer) => offer.id)).toEqual([memberOffer.id])
  const [voucherAfter] = await db.select().from(offers).where(eq(offers.id, small.id))
  expect(voucherAfter.usageCount).toBe(0)
})

test('a voucher that does not combine replaces smaller discounts, and leaves out vouchers that do', async () => {
  const product = await createProduct()
  const userId = unique('shopper')
  await createOffer({ productId: product.id, percent: '20', everyone: true })
  const combining = await createOffer({ productId: product.id, percent: '10', type: 'voucher', everyone: true })
  const big = await createOffer({ productId: product.id, percent: '50', type: 'voucher', everyone: true, combines: false })
  const cart = await cartOf(userId, product.variants[0].id)

  await applyVoucher(cart.sessionId, combining.voucherCode!, userId)
  expect(await discount(cart.sessionId)).toBe(30)
  // Applied even though it would not fit on top of the others
  await applyVoucher(cart.sessionId, big.voucherCode!, userId)
  const summary = await cartService.getCartSummary(cart.sessionId)
  expect(Number(summary.totalOfferDiscount)).toBe(50)
  expect(summary.voucherOfferDiscounts.map((d) => d.id)).toEqual([big.id])
  expect(summary.userOfferDiscounts).toEqual([])
  expect(summary.notCombinedVoucherOffers.map((voucher) => voucher.id)).toEqual([combining.id])
})

test('member prices: the lowest over the plans, for offers one unit qualifies for', async () => {
  const premium = await plan()
  const platinum = await plan()
  const product = await createProduct('100')
  const other = await createProduct('50')
  await createOffer({ productId: product.id, percent: '10', planIds: [premium.id] })
  await createOffer({ productId: product.id, percent: '20', planIds: [platinum.id] })
  // Needs 3 units, so it does not count for one
  await createOffer({ productId: product.id, percent: '50', planIds: [premium.id], minQuantity: '3' })
  const variant = { ...product.variants[0], productId: product.id }
  const otherVariant = { ...other.variants[0], productId: other.id }
  const offerService = new OfferService(db)

  const prices = await offerService.memberPrices([variant, otherVariant])
  expect(prices.get(variant.id)).toEqual({ planId: platinum.id, planName: platinum.name, price: '80' })
  expect(prices.has(otherVariant.id)).toBe(false)
  // For a member of Premium only
  expect((await offerService.memberPrices([variant], [premium.id])).get(variant.id)!.price).toBe('90')
  expect((await offerService.memberPrices([variant], [])).size).toBe(0)

  // Both at once: the same as asking for each
  for (const planIds of [[premium.id], [platinum.id], []]) {
    expect(await offerService.memberPricesFor([variant, otherVariant], planIds)).toEqual({
      yours: await offerService.memberPrices([variant, otherVariant], planIds),
      lowest: prices,
    })
  }
})
