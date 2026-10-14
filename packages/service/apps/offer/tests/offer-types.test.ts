import { beforeAll, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { OfferService } from 'apps/offer/services/offer'
import { OrderService } from 'apps/order/services/order'
import { ShippingMethodService } from 'apps/order/services/shipping-method'
import { ProductService } from 'apps/product/services/product'
import {
  offerBenefits,
  offerConditions,
  offerRangeIncludedProducts,
  offerRanges,
  offers,
} from 'apps/offer/schemas'

const cartService = new CartService(db)
const offerService = new OfferService(db)
const orderService = new OrderService(db)
const productService = new ProductService(db)

let count = 0
const unique = (prefix: string) => `${prefix}-${++count}`

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

const createProduct = async (price: string) => {
  const slug = unique('offer-types-product')
  return await productService.create({ name: slug, slug, sku: slug, price, status: 'Published' })
}

// Every offer here covers only the given products, so it cannot reach the
// carts of other tests in this file
const createOffer = async (options: {
  type: 'site' | 'user' | 'voucher'
  productIds: number[]
  conditionType: 'basket_quantity' | 'basket_total' | 'distinct_items'
  conditionValue: string
  benefitType: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
  benefitValue: string
  maxAffectedItems?: number
  includeAllUsers?: boolean
  overallLimit?: number
}) => {
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: unique('range'),
      inclusiveFilter: true,
      includeAllProducts: false,
      includeAllBrands: true,
      includeAllCategories: true,
      includeAllProductClasses: true,
    })
    .returning()
  await db.insert(offerRangeIncludedProducts).values(
    options.productIds.map((productId) => ({ rangeId: range.id, productId })),
  )
  const [condition] = await db
    .insert(offerConditions)
    .values({
      rangeId: range.id,
      type: options.conditionType,
      value: options.conditionValue,
    })
    .returning()
  const [benefit] = await db
    .insert(offerBenefits)
    .values({
      name: unique('benefit'),
      type: options.benefitType,
      value: options.benefitValue,
      maxAffectedItems: options.maxAffectedItems,
    })
    .returning()
  const name = unique('offer')
  const [offer] = await db
    .insert(offers)
    .values({
      name,
      type: options.type,
      voucherCode: options.type === 'voucher' ? name.toUpperCase() : undefined,
      includeAllUsers: options.includeAllUsers ?? true,
      conditionId: condition.id,
      benefitId: benefit.id,
      overallLimit: options.overallLimit,
    })
    .returning()
  return offer
}

const createCart = async (
  userId: string | undefined,
  items: { variantId: number; quantity: number }[],
) => {
  const cart = await cartService.create(userId)
  for (const item of items) {
    await cartService.addToCart(cart.id, item.variantId, item.quantity)
  }
  return cart
}

const applyVoucher = async (sessionId: string, voucherCode: string, userId: string) => {
  const content = await cartService.getCartContentForSession(sessionId)
  return await offerService.applyVoucherCode(content, undefined, voucherCode, userId)
}

const discountsByVariant = (content: { lines: { variantId: number; totalOfferDiscount: number }[] }) =>
  Object.fromEntries(content.lines.map((line) => [line.variantId, line.totalOfferDiscount]))

test('basket_total applies once the in-range lines reach the value', async () => {
  const a = await createProduct('30')
  const b = await createProduct('20')
  const outside = await createProduct('500')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [a.id, b.id],
    conditionType: 'basket_total',
    conditionValue: '100',
    benefitType: 'percentage',
    benefitValue: '10',
  })
  const userId = unique('user')
  // 30 x 2 + 20 = 80 in range; the product outside the range does not count
  const short = await createCart(userId, [
    { variantId: a.variants[0].id, quantity: 2 },
    { variantId: b.variants[0].id, quantity: 1 },
    { variantId: outside.variants[0].id, quantity: 1 },
  ])
  await expect(applyVoucher(short.sessionId, voucher.voucherCode!, userId)).rejects.toThrow(
    'Voucher code is not applicable to any product in the cart',
  )

  const enough = await createCart(unique('user'), [
    { variantId: a.variants[0].id, quantity: 3 },
    { variantId: b.variants[0].id, quantity: 1 },
    { variantId: outside.variants[0].id, quantity: 1 },
  ])
  const applied = await applyVoucher(enough.sessionId, voucher.voucherCode!, enough.userId!)

  expect(discountsByVariant(applied)).toEqual({
    [a.variants[0].id]: 9,
    [b.variants[0].id]: 2,
    [outside.variants[0].id]: 0,
  })
  expect(applied.totalOfferDiscount).toBe(11)
})

test('distinct_items counts different in-range products', async () => {
  const a = await createProduct('10')
  const b = await createProduct('10')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [a.id, b.id],
    conditionType: 'distinct_items',
    conditionValue: '2',
    benefitType: 'fixed_amount',
    benefitValue: '1',
  })
  const one = await createCart(unique('user'), [{ variantId: a.variants[0].id, quantity: 5 }])
  await expect(applyVoucher(one.sessionId, voucher.voucherCode!, one.userId!)).rejects.toThrow(
    'Voucher code is not applicable to any product in the cart',
  )

  const two = await createCart(unique('user'), [
    { variantId: a.variants[0].id, quantity: 2 },
    { variantId: b.variants[0].id, quantity: 1 },
  ])
  const applied = await applyVoucher(two.sessionId, voucher.voucherCode!, two.userId!)

  expect(applied.totalOfferDiscount).toBe(3)
})

test('fixed_price sells each in-range item at the value', async () => {
  const product = await createProduct('50')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [product.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'fixed_price',
    benefitValue: '30',
  })
  const cart = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 2 }])

  const applied = await applyVoucher(cart.sessionId, voucher.voucherCode!, cart.userId!)

  expect(applied.lines[0].totalOfferDiscount).toBe(40)
})

test('fixed_price respects maxAffectedItems and does not apply to cheaper items', async () => {
  const product = await createProduct('50')
  const cheap = await createProduct('20')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [product.id, cheap.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'fixed_price',
    benefitValue: '30',
    maxAffectedItems: 1,
  })
  const cart = await createCart(unique('user'), [
    { variantId: product.variants[0].id, quantity: 3 },
    { variantId: cheap.variants[0].id, quantity: 1 },
  ])

  const applied = await applyVoucher(cart.sessionId, voucher.voucherCode!, cart.userId!)

  expect(discountsByVariant(applied)).toEqual({
    [product.variants[0].id]: 20,
    [cheap.variants[0].id]: 0,
  })

  const onlyCheap = await createCart(unique('user'), [
    { variantId: cheap.variants[0].id, quantity: 1 },
  ])
  await expect(
    applyVoucher(onlyCheap.sessionId, voucher.voucherCode!, onlyCheap.userId!),
  ).rejects.toThrow('Voucher code is not applicable to any product in the cart')
})

test('maxAffectedItems caps each affected unit at its own price', async () => {
  const product = await createProduct('40')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [product.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'fixed_amount',
    benefitValue: '100',
    maxAffectedItems: 2,
  })
  const cart = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 5 }])

  const applied = await applyVoucher(cart.sessionId, voucher.voucherCode!, cart.userId!)

  expect(applied.lines[0].totalOfferDiscount).toBe(80)
})

test('a free_shipping voucher waives the shipping charge through checkout', async () => {
  const product = await createProduct('25')
  const voucher = await createOffer({
    type: 'voucher',
    productIds: [product.id],
    conditionType: 'basket_total',
    conditionValue: '50',
    benefitType: 'free_shipping',
    benefitValue: '0',
  })
  const method = await new ShippingMethodService(db).create({ name: unique('ship'), price: '15' })
  const short = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 1 }])
  await expect(applyVoucher(short.sessionId, voucher.voucherCode!, short.userId!)).rejects.toThrow(
    'Voucher code is not applicable to any product in the cart',
  )

  const cart = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 2 }])
  const applied = await applyVoucher(cart.sessionId, voucher.voucherCode!, cart.userId!)
  expect(applied.totalOfferDiscount).toBe(0)

  const summary = await cartService.getCartSummary(cart.sessionId, { shippingMethodId: method.id })
  expect(Number(summary.shippingCharge)).toBe(0)
  expect(Number(summary.total)).toBe(50)

  const order = await orderService.createFromCart(cart.id, {
    shippingMethodId: method.id,
    expectedTotal: summary.total,
  })
  expect(Number(order.shippingCharge)).toBe(0)
  expect(order.offers?.map((offer: any) => offer.id)).toEqual([voucher.id])
  const [used] = await db.select().from(offers).where(eq(offers.id, voucher.id))
  expect(used.usageCount).toBe(1)
})

test('refuses a second free shipping voucher', async () => {
  const product = await createProduct('25')
  const first = await createOffer({
    type: 'voucher',
    productIds: [product.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'free_shipping',
    benefitValue: '0',
  })
  const second = await createOffer({
    type: 'voucher',
    productIds: [product.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'free_shipping',
    benefitValue: '0',
  })
  const cart = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 1 }])
  const applied = await applyVoucher(cart.sessionId, first.voucherCode!, cart.userId!)

  await expect(
    offerService.applyVoucherCode(applied, undefined, second.voucherCode!, cart.userId!),
  ).rejects.toThrow('Free shipping already applied')
})

test('user offers with the new conditions and benefits apply in the cart summary', async () => {
  const product = await createProduct('50')
  await createOffer({
    type: 'user',
    productIds: [product.id],
    conditionType: 'basket_total',
    conditionValue: '100',
    benefitType: 'fixed_price',
    benefitValue: '45',
  })
  const cart = await createCart(unique('user'), [{ variantId: product.variants[0].id, quantity: 2 }])

  const summary = await cartService.getCartSummary(cart.sessionId)

  expect(summary.totalOfferDiscount).toBe(10)
  expect(summary.userOfferDiscounts.map((d) => d.benefitType)).toEqual(['fixed_price'])
})

test('site offers apply to every cart, guests included, and count at checkout', async () => {
  const product = await createProduct('40')
  const site = await createOffer({
    type: 'site',
    productIds: [product.id],
    conditionType: 'basket_quantity',
    conditionValue: '1',
    benefitType: 'percentage',
    benefitValue: '25',
    // Site offers ignore user targeting
    includeAllUsers: false,
    overallLimit: 1,
  })
  const guest = await createCart(undefined, [{ variantId: product.variants[0].id, quantity: 1 }])
  const signedIn = await createCart(unique('user'), [
    { variantId: product.variants[0].id, quantity: 1 },
  ])

  const guestSummary = await cartService.getCartSummary(guest.sessionId)
  const signedInSummary = await cartService.getCartSummary(signedIn.sessionId)
  expect(guestSummary.totalOfferDiscount).toBe(10)
  expect(guestSummary.siteOfferDiscounts.map((d) => d.id)).toEqual([site.id])
  expect(Number(guestSummary.total)).toBe(30)
  expect(signedInSummary.totalOfferDiscount).toBe(10)

  const order = await orderService.createFromCart(guest.id, { expectedTotal: guestSummary.total })
  expect(order.offers?.map((offer: any) => offer.id)).toEqual([site.id])

  // Its one use is gone, so it no longer applies
  const after = await cartService.getCartSummary(signedIn.sessionId)
  expect(after.totalOfferDiscount).toBe(0)
})

test('a site free_shipping offer waives shipping for guests', async () => {
  const product = await createProduct('10')
  await createOffer({
    type: 'site',
    productIds: [product.id],
    conditionType: 'distinct_items',
    conditionValue: '1',
    benefitType: 'free_shipping',
    benefitValue: '0',
  })
  const method = await new ShippingMethodService(db).create({ name: unique('ship'), price: '15' })
  const guest = await createCart(undefined, [{ variantId: product.variants[0].id, quantity: 1 }])

  const summary = await cartService.getCartSummary(guest.sessionId, { shippingMethodId: method.id })

  expect(Number(summary.shippingCharge)).toBe(0)
  expect(Number(summary.total)).toBe(10)
})
