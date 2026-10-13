import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
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
const offerService = new OfferService(db)
const orderService = new OrderService(db)
const productService = new ProductService(db)

let productCount = 0

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

const createProduct = async (price: string, discountedPrice?: string) => {
  productCount++
  const slug = `offer-discount-product-${productCount}`
  return await productService.create({
    name: slug,
    slug,
    sku: slug,
    price,
    discountedPrice,
  })
}

const createVoucher = async (options: {
  code: string
  benefitType: 'percentage' | 'fixed_amount'
  benefitValue: string
  minQuantity?: string
  productIds?: number[]
  maxAffectedItems?: number
  endDate?: string
  overallLimit?: number
  usageCount?: number
}) => {
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: `Range ${options.code}`,
      inclusiveFilter: true,
      includeAllProducts: !options.productIds,
      includeAllBrands: true,
      includeAllCategories: true,
      includeAllProductClasses: true,
    })
    .returning()
  if (options.productIds) {
    await db.insert(offerRangeIncludedProducts).values(
      options.productIds.map((productId) => ({
        rangeId: range.id,
        productId,
      })),
    )
  }
  const [condition] = await db
    .insert(offerConditions)
    .values({
      rangeId: range.id,
      type: 'basket_quantity',
      value: options.minQuantity ?? '1',
    })
    .returning()
  const [benefit] = await db
    .insert(offerBenefits)
    .values({
      name: `Benefit ${options.code}`,
      type: options.benefitType,
      value: options.benefitValue,
      maxAffectedItems: options.maxAffectedItems,
    })
    .returning()
  const [offer] = await db
    .insert(offers)
    .values({
      name: `Voucher ${options.code}`,
      type: 'voucher',
      voucherCode: options.code,
      includeAllUsers: true,
      conditionId: condition.id,
      benefitId: benefit.id,
      endDate: options.endDate,
      overallLimit: options.overallLimit,
      usageCount: options.usageCount,
    })
    .returning()
  return offer
}

const cartFor = async (userId: string, productId: number, quantity: number) => {
  const cart = await cartService.create(userId)
  await cartService.addToCart(cart.id, productId, quantity)
  const content = await cartService.getCartContentForSession(cart.sessionId)
  return content
}

test('should discount a percentage of the sale price, not the list price', async () => {
  const userId = 'discount-sale-price-user'
  const product = await createProduct('100', '80')
  await createVoucher({
    code: 'SALE10',
    benefitType: 'percentage',
    benefitValue: '10',
  })
  const content = await cartFor(userId, product.id, 2)

  const applied = await offerService.applyVoucherCode(content, undefined, 'SALE10', userId)

  expect(applied.lines[0].totalOfferDiscount).toBe(16)
  expect(applied.totalOfferDiscount).toBe(16)
})

test('should multiply a fixed voucher by quantity', async () => {
  const userId = 'discount-fixed-qty-user'
  const product = await createProduct('50')
  await createVoucher({
    code: 'FIXED10',
    benefitType: 'fixed_amount',
    benefitValue: '10',
  })
  const content = await cartFor(userId, product.id, 3)

  const applied = await offerService.applyVoucherCode(content, undefined, 'FIXED10', userId)

  expect(applied.lines[0].totalOfferDiscount).toBe(30)
})

test('should cap a voucher at the selling price', async () => {
  const userId = 'discount-cap-user'
  const product = await createProduct('40')
  await createVoucher({
    code: 'FIXED100',
    benefitType: 'fixed_amount',
    benefitValue: '100',
  })
  const content = await cartFor(userId, product.id, 1)

  const applied = await offerService.applyVoucherCode(content, undefined, 'FIXED100', userId)

  expect(applied.lines[0].totalOfferDiscount).toBe(40)
})

test('should only fill the room left under the selling price', async () => {
  const userId = 'discount-stack-user'
  const product = await createProduct('40')
  await createVoucher({
    code: 'STACK30',
    benefitType: 'fixed_amount',
    benefitValue: '30',
  })
  await createVoucher({
    code: 'STACK50',
    benefitType: 'percentage',
    benefitValue: '50',
  })
  const content = await cartFor(userId, product.id, 1)
  const first = await offerService.applyVoucherCode(content, undefined, 'STACK30', userId)

  const second = await offerService.applyVoucherCode(first, undefined, 'STACK50', userId)

  expect(second.lines[0].voucherOfferDiscounts.map((d) => d.discount)).toEqual([30, 10])
  expect(second.lines[0].totalOfferDiscount).toBe(40)
})

test('should refuse another voucher once the selling price is fully discounted', async () => {
  const userId = 'discount-full-user'
  const product = await createProduct('40')
  await createVoucher({
    code: 'FULL40',
    benefitType: 'fixed_amount',
    benefitValue: '40',
  })
  await createVoucher({
    code: 'FULLMORE',
    benefitType: 'fixed_amount',
    benefitValue: '1',
  })
  const content = await cartFor(userId, product.id, 1)
  const applied = await offerService.applyVoucherCode(content, undefined, 'FULL40', userId)

  await expect(
    offerService.applyVoucherCode(applied, undefined, 'FULLMORE', userId),
  ).rejects.toThrow('Discount already applied to all applicable products')
})

test('should ignore a product outside the voucher range', async () => {
  const userId = 'discount-range-user'
  const included = await createProduct('20')
  const excluded = await createProduct('20')
  await createVoucher({
    code: 'RANGEONLY',
    benefitType: 'percentage',
    benefitValue: '10',
    productIds: [included.id],
  })
  const content = await cartFor(userId, excluded.id, 1)

  await expect(
    offerService.applyVoucherCode(content, undefined, 'RANGEONLY', userId),
  ).rejects.toThrow('Voucher code is not applicable to any product in the cart')
})

test('should reject a voucher when the quantity condition is not met', async () => {
  const userId = 'discount-qty-user'
  const product = await createProduct('20')
  await createVoucher({
    code: 'QTY3',
    benefitType: 'percentage',
    benefitValue: '10',
    minQuantity: '3',
  })
  const content = await cartFor(userId, product.id, 2)

  await expect(
    offerService.applyVoucherCode(content, undefined, 'QTY3', userId),
  ).rejects.toThrow('Voucher code is not applicable to any product in the cart')
})

test('should limit a fixed voucher to maxAffectedItems units', async () => {
  const userId = 'discount-max-items-user'
  const product = await createProduct('100')
  await createVoucher({
    code: 'MAX2',
    benefitType: 'fixed_amount',
    benefitValue: '10',
    maxAffectedItems: 2,
  })
  const content = await cartFor(userId, product.id, 5)

  const applied = await offerService.applyVoucherCode(content, undefined, 'MAX2', userId)

  expect(applied.lines[0].totalOfferDiscount).toBe(20)
})

test('should reject an expired voucher and a voucher past its usage limit', async () => {
  const userId = 'discount-invalid-user'
  const product = await createProduct('20')
  await createVoucher({
    code: 'EXPIRED',
    benefitType: 'percentage',
    benefitValue: '10',
    endDate: '2000-01-01T00:00:00.000Z',
  })
  await createVoucher({
    code: 'USEDUP',
    benefitType: 'percentage',
    benefitValue: '10',
    overallLimit: 1,
    usageCount: 1,
  })
  const content = await cartFor(userId, product.id, 1)

  await expect(
    offerService.applyVoucherCode(content, undefined, 'EXPIRED', userId),
  ).rejects.toThrow('Invalid voucher code')
  await expect(
    offerService.applyVoucherCode(content, undefined, 'USEDUP', userId),
  ).rejects.toThrow('Voucher code usage limit exceeded')
})

test('should apply a user offer as a percentage of the sale price', async () => {
  const userId = 'discount-user-offer-user'
  const product = await createProduct('100', '80')
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: 'User offer range',
      inclusiveFilter: true,
      includeAllProducts: true,
      includeAllBrands: true,
      includeAllCategories: true,
      includeAllProductClasses: true,
    })
    .returning()
  const [condition] = await db
    .insert(offerConditions)
    .values({ rangeId: range.id, type: 'basket_quantity', value: '1' })
    .returning()
  const [benefit] = await db
    .insert(offerBenefits)
    .values({ name: 'User 10 percent', type: 'percentage', value: '10' })
    .returning()
  await db.insert(offers).values({
    name: 'User 10 percent',
    type: 'user',
    includeAllUsers: true,
    conditionId: condition.id,
    benefitId: benefit.id,
  })
  const content = await cartFor(userId, product.id, 1)

  const applied = await cartService.applyUserOffers(content, userId)

  expect(applied.lines[0].totalOfferDiscount).toBe(8)
  expect(applied.userOfferDiscounts).toHaveLength(1)
})

test('should not copy a voucher discount onto the order line', async () => {
  const userId = 'discount-order-line-user'
  const product = await createProduct('100')
  await createVoucher({
    code: 'ORDER10',
    benefitType: 'percentage',
    benefitValue: '10',
  })
  const content = await cartFor(userId, product.id, 1)
  const applied = await offerService.applyVoucherCode(content, undefined, 'ORDER10', userId)
  expect(applied.lines[0].totalOfferDiscount).toBe(10)

  const order = await orderService.createFromCart(content.id)

  expect(Number(order.lines[0].price)).toBe(100)
  expect(Number(order.lines[0].discount)).toBe(0)
  // The voucher discount goes on the order instead. Other active user offers
  // from earlier tests may also apply, so compare against the recorded offers.
  const voucher = order.offers!.find((o) => o.voucherCode === 'ORDER10')!
  expect(voucher.discount).toBe(10)
  const offersTotal = order.offers!.reduce((sum, o) => sum + o.discount, 0)
  expect(Number(order.discount)).toBe(offersTotal)
})
