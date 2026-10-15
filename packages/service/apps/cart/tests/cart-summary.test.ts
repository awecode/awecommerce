// Tax settings are store-wide, so the cart summary is tested in its own file.
import { beforeAll, beforeEach, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { OrderService } from 'apps/order/services/order'
import { ShippingMethodService } from 'apps/order/services/shipping-method'
import { OfferService } from 'apps/offer/services/offer'
import {
  ProductClassService,
  ProductService,
  ProductVariantService,
} from 'apps/product/services/product'
import { TaxService } from 'apps/tax/services/tax'
import { carts } from 'apps/cart/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offers,
} from 'apps/offer/schemas'

const cartService = new CartService(db)
const productService = new ProductService(db)
const taxService = new TaxService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createProduct = async (
  price: string,
  options: { discountedPrice?: string; productClassId?: number } = {},
) => {
  const slug = unique('summary-product')
  return await productService.create({ stockQuantity: 1000, name: slug, slug, sku: slug, price, status: 'Published', ...options })
}

const createCart = async (items: Array<{ variantId: number; quantity: number }>) => {
  const userId = unique('summary-user')
  const cart = await cartService.create(userId)
  for (const item of items) {
    await cartService.addToCart(cart.id, item.variantId, item.quantity)
  }
  return { cart, userId }
}

const createVoucher = async (voucherCode: string, percentage: string) => {
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: voucherCode,
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
    .values({ name: voucherCode, type: 'percentage', value: percentage })
    .returning()
  const [offer] = await db
    .insert(offers)
    .values({
      name: voucherCode,
      type: 'voucher',
      voucherCode,
      includeAllUsers: true,
      conditionId: condition.id,
      benefitId: benefit.id,
    })
    .returning()
  return offer
}

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

beforeEach(async () => {
  await taxService.updateSettings({
    pricesIncludeTax: false,
    defaultRate: '13',
    taxShipping: false,
  })
})

test('should show tax per line and the cart totals', async () => {
  const product = await createProduct('100')
  const { cart } = await createCart([{ variantId: product.variants[0].id, quantity: 2 }])

  const summary = await cartService.getCartSummary(cart.sessionId)

  expect(summary.lines).toHaveLength(1)
  expect(Number(summary.lines[0].tax)).toBe(26)
  expect(Number(summary.lines[0].taxRate)).toBe(13)
  expect(Number(summary.subtotal)).toBe(200)
  expect(Number(summary.shippingCharge)).toBe(0)
  expect(Number(summary.tax)).toBe(26)
  expect(Number(summary.total)).toBe(226)
  expect(summary.pricesIncludeTax).toBe(false)
})

test('should match the order created from the cart', async () => {
  await taxService.updateSettings({ taxShipping: true })
  const reducedClass = await new ProductClassService(db).create({
    name: unique('summary-class'),
    slug: unique('summary-class'),
    taxRate: '5',
  })
  const onSale = await createProduct('100', { discountedPrice: '80' })
  const reduced = await createProduct('40', { productClassId: reducedClass.id })
  const { cart, userId } = await createCart([
    { variantId: onSale.variants[0].id, quantity: 1 },
    { variantId: reduced.variants[0].id, quantity: 3 },
  ])
  await createVoucher('SUMMARY10', '10')
  const content = await cartService.getCartContentForSession(cart.sessionId)
  await new OfferService(db).applyVoucherCode(content, undefined, 'SUMMARY10', userId)
  const method = await new ShippingMethodService(db).create({ name: 'Courier', price: '50' })

  const summary = await cartService.getCartSummary(cart.sessionId, {
    shippingMethodId: method.id,
  })
  const order = await new OrderService(db).createFromCart(cart.id, {
    shippingMethodId: method.id,
    expectedTotal: summary.total,
  })

  expect(Number(summary.total)).toBe(Number(order.total))
  expect(Number(summary.tax)).toBe(Number(order.tax))
  expect(Number(summary.totalOfferDiscount)).toBe(Number(order.discount))
  expect(Number(summary.shippingCharge)).toBe(50)
})

test('should split tax out without changing the total when prices include tax', async () => {
  await taxService.updateSettings({ pricesIncludeTax: true })
  const product = await createProduct('113')
  const { cart } = await createCart([{ variantId: product.variants[0].id, quantity: 1 }])

  const summary = await cartService.getCartSummary(cart.sessionId)

  expect(Number(summary.tax)).toBe(13)
  expect(Number(summary.total)).toBe(113)
  expect(summary.pricesIncludeTax).toBe(true)
})

test('should say whether the cart is shipped, from the product classes', async () => {
  const classes = new ProductClassService(db)
  const digital = await classes.create({ name: unique('E-book'), slug: unique('e-book'), requiresShipping: false })
  const physical = await classes.create({ name: unique('Book'), slug: unique('book') })
  const ebook = await createProduct('10', { productClassId: digital.id })
  const book = await createProduct('20', { productClassId: physical.id })
  const plain = await createProduct('30')
  const method = await new ShippingMethodService(db).create({ name: 'Courier', price: '5' })

  const digitalOnly = await createCart([{ variantId: ebook.variants[0].id, quantity: 1 }])
  const summary = await cartService.getCartSummary(digitalOnly.cart.sessionId)
  expect(summary.requiresShipping).toBe(false)
  expect(summary.lines[0].requiresShipping).toBe(false)
  expect(await cartService.requiresShipping(digitalOnly.cart.id)).toBe(false)
  // Nothing to ship, so no shipping method or charge
  await expect(
    cartService.getCartSummary(digitalOnly.cart.sessionId, { shippingMethodId: method.id }),
  ).rejects.toThrow('Nothing in the cart is shipped, so it takes no shipping method')

  // A class that ships, or no class at all, makes the cart shipped
  for (const product of [book, plain]) {
    const mixed = await createCart([
      { variantId: ebook.variants[0].id, quantity: 1 },
      { variantId: product.variants[0].id, quantity: 1 },
    ])
    const mixedSummary = await cartService.getCartSummary(mixed.cart.sessionId, { shippingMethodId: method.id })
    expect(mixedSummary.requiresShipping).toBe(true)
    expect(mixedSummary.lines.map((line) => line.requiresShipping)).toEqual([false, true])
    expect(Number(mixedSummary.shippingCharge)).toBe(5)
    expect(await cartService.requiresShipping(mixed.cart.id)).toBe(true)
  }
})

test('should reject an unknown shipping method', async () => {
  const product = await createProduct('10')
  const { cart } = await createCart([{ variantId: product.variants[0].id, quantity: 1 }])
  await expect(
    cartService.getCartSummary(cart.sessionId, { shippingMethodId: 999999 }),
  ).rejects.toThrow('Shipping method not found: 999999')
})

test('should not place an order or use up offers', async () => {
  const product = await createProduct('100')
  const { cart, userId } = await createCart([{ variantId: product.variants[0].id, quantity: 1 }])
  const voucher = await createVoucher('SUMMARYONLY', '10')
  const content = await cartService.getCartContentForSession(cart.sessionId)
  await new OfferService(db).applyVoucherCode(content, undefined, 'SUMMARYONLY', userId)

  await cartService.getCartSummary(cart.sessionId)
  await cartService.getCartSummary(cart.sessionId)

  const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
  expect(cartAfter.status).toBe('Open')
  const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
  expect(offer.usageCount).toBe(0)
})

test('should flag lines that are no longer for sale', async () => {
  const available = await createProduct('10')
  const unpublished = await createProduct('20')
  const deactivated = await createProduct('30')
  const { cart } = await createCart([
    { variantId: available.variants[0].id, quantity: 1 },
    { variantId: unpublished.variants[0].id, quantity: 1 },
    { variantId: deactivated.variants[0].id, quantity: 1 },
  ])
  await productService.update(unpublished.id, { status: 'Draft' })
  await new ProductVariantService(db).markAsInactive(deactivated.variants[0].id)

  const summary = await cartService.getCartSummary(cart.sessionId)

  const flags = Object.fromEntries(summary.lines.map((line) => [line.variantId, line.isAvailable]))
  expect(flags).toEqual({
    [available.variants[0].id]: true,
    [unpublished.variants[0].id]: false,
    [deactivated.variants[0].id]: false,
  })
})
