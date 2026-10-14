// Tax settings are store-wide, so order tax is tested in its own file: changing
// them here does not affect the totals checked by other order tests.
import { beforeAll, beforeEach, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'
import { ShippingMethodService } from 'apps/order/services/shipping-method'
import { CartService } from 'apps/cart/services/cart'
import { OfferService } from 'apps/offer/services/offer'
import { ProductClassService, ProductService } from 'apps/product/services/product'
import { TaxService } from 'apps/tax/services/tax'
import { orderLines } from 'apps/order/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offers,
} from 'apps/offer/schemas'

const orderService = new OrderService(db)
const cartService = new CartService(db)
const productService = new ProductService(db)
const taxService = new TaxService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createProduct = async (
  price: string,
  options: { discountedPrice?: string; productClassId?: number } = {},
) => {
  const slug = unique('tax-product')
  return await productService.create({ stockQuantity: 1000, name: slug, slug, sku: slug, price, status: 'Published', ...options })
}

const createProductClass = async (taxRate: string | null) => {
  const slug = unique('tax-class')
  return await new ProductClassService(db).create({ name: slug, slug, taxRate })
}

const orderFor = async (
  items: Array<{ variantId: number; quantity: number }>,
  options: Parameters<OrderService['createFromCart']>[1] = {},
  voucherCode?: string,
) => {
  const userId = unique('tax-user')
  const cart = await cartService.create(userId)
  for (const item of items) {
    await cartService.addToCart(cart.id, item.variantId, item.quantity)
  }
  if (voucherCode) {
    const content = await cartService.getCartContentForSession(cart.sessionId)
    await new OfferService(db).applyVoucherCode(content, undefined, voucherCode, userId)
  }
  return await orderService.createFromCart(cart.id, options)
}

const savedLines = async (orderId: number) =>
  await db.select().from(orderLines).where(eq(orderLines.orderId, orderId))

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
  await db.insert(offers).values({
    name: voucherCode,
    type: 'voucher',
    voucherCode,
    includeAllUsers: true,
    conditionId: condition.id,
    benefitId: benefit.id,
  })
}

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

// Every test starts from 13% added on top, shipping not taxed
beforeEach(async () => {
  await taxService.updateSettings({
    pricesIncludeTax: false,
    defaultRate: '13',
    taxShipping: false,
  })
})

test('should add tax on top of prices at the default rate', async () => {
  const product = await createProduct('100')
  const order = await orderFor([{ variantId: product.variants[0].id, quantity: 2 }])

  expect(Number(order.tax)).toBe(26)
  expect(Number(order.total)).toBe(226)
  const [line] = await savedLines(order.id)
  expect(Number(line.tax)).toBe(26)
  expect(Number(line.taxRate)).toBe(13)
})

test('should use the product class rate, and the default when the class has none', async () => {
  const exemptClass = await createProductClass('0')
  const reducedClass = await createProductClass('5')
  const noRateClass = await createProductClass(null)
  const exempt = await createProduct('100', { productClassId: exemptClass.id })
  const reduced = await createProduct('100', { productClassId: reducedClass.id })
  const defaulted = await createProduct('100', { productClassId: noRateClass.id })

  const order = await orderFor([
    { variantId: exempt.variants[0].id, quantity: 1 },
    { variantId: reduced.variants[0].id, quantity: 1 },
    { variantId: defaulted.variants[0].id, quantity: 1 },
  ])

  const byProduct = Object.fromEntries(
    (await savedLines(order.id)).map((l) => [l.productId, [Number(l.taxRate), Number(l.tax)]]),
  )
  expect(byProduct[exempt.id]).toEqual([0, 0])
  expect(byProduct[reduced.id]).toEqual([5, 5])
  expect(byProduct[defaulted.id]).toEqual([13, 13])
  expect(Number(order.tax)).toBe(18)
  expect(Number(order.total)).toBe(318)
})

test('should split tax out of tax-inclusive prices without changing the total', async () => {
  await taxService.updateSettings({ pricesIncludeTax: true })
  const product = await createProduct('113')

  const order = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }])

  expect(Number(order.tax)).toBe(13)
  expect(Number(order.total)).toBe(113)
})

test('should tax the price after the sale price and offer discounts', async () => {
  await createVoucher('TAX10', '10')
  // Sale price 80, then 10% off: 72 is what the customer pays before tax
  const product = await createProduct('100', { discountedPrice: '80' })

  const order = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }], {}, 'TAX10')

  expect(Number(order.discount)).toBe(8)
  expect(Number(order.tax)).toBe(9.36)
  expect(Number(order.total)).toBe(81.36)
})

test('should tax shipping at the default rate only when enabled', async () => {
  const product = await createProduct('100')
  const method = await new ShippingMethodService(db).create({ name: 'Courier', price: '50' })

  const untaxed = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }], {
    shippingMethodId: method.id,
  })
  expect(Number(untaxed.tax)).toBe(13)
  expect(Number(untaxed.total)).toBe(163)

  await taxService.updateSettings({ taxShipping: true })
  const taxed = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }], {
    shippingMethodId: method.id,
  })
  expect(Number(taxed.tax)).toBe(19.5)
  expect(Number(taxed.total)).toBe(169.5)
})

test('should split tax out of a tax-inclusive shipping price', async () => {
  await taxService.updateSettings({ pricesIncludeTax: true, taxShipping: true })
  const product = await createProduct('113')
  const method = await new ShippingMethodService(db).create({ name: 'Inclusive', price: '56.5' })

  const order = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }], {
    shippingMethodId: method.id,
  })

  expect(Number(order.tax)).toBe(19.5)
  expect(Number(order.total)).toBe(169.5)
})

test('should round tax per line to 2 decimal places before adding up', async () => {
  // 10.05 x 13% = 1.3065 per line, which rounds to 1.31
  const first = await createProduct('10.05')
  const second = await createProduct('10.05')

  const order = await orderFor([
    { variantId: first.variants[0].id, quantity: 1 },
    { variantId: second.variants[0].id, quantity: 1 },
  ])

  expect(Number(order.tax)).toBe(2.62)
  expect(Number(order.total)).toBe(22.72)
})

test('should include tax in the expected total check', async () => {
  const product = await createProduct('100')
  await expect(
    orderFor([{ variantId: product.variants[0].id, quantity: 1 }], { expectedTotal: '100' }),
  ).rejects.toThrow('Order total changed: expected 100, got 113')
  const order = await orderFor([{ variantId: product.variants[0].id, quantity: 1 }], {
    expectedTotal: '113',
  })
  expect(Number(order.total)).toBe(113)
})
