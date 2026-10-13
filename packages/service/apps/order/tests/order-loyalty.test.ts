// Loyalty and tax settings are store-wide, so redeeming points at checkout is
// tested in its own file.
import { beforeAll, beforeEach, expect, test } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'
import { ShippingMethodService } from 'apps/order/services/shipping-method'
import { CartService } from 'apps/cart/services/cart'
import { OfferService } from 'apps/offer/services/offer'
import { ProductClassService, ProductService } from 'apps/product/services/product'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { TaxService } from 'apps/tax/services/tax'
import { carts } from 'apps/cart/schemas'
import { orders } from 'apps/order/schemas'
import { loyaltyLogs, loyaltyPoints } from 'apps/loyalty/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offers,
} from 'apps/offer/schemas'

const orderService = new OrderService(db)
const cartService = new CartService(db)
const productService = new ProductService(db)
const loyaltyService = new LoyaltyService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createProduct = async (price: string, productClassId?: number) => {
  const slug = unique('loyalty-product')
  return await productService.create({ name: slug, slug, sku: slug, price, productClassId })
}

// A user with a points balance and a cart
const setUp = async (
  items: Array<{ variantId: number; quantity: number }>,
  balance = '1000',
) => {
  const userId = unique('loyalty-user')
  await db.insert(loyaltyPoints).values({ userId, orderId: 0, earnedPoints: balance })
  const cart = await cartService.create(userId)
  for (const item of items) {
    await cartService.addToCart(cart.id, item.variantId, item.quantity)
  }
  return { userId, cart }
}

const balance = async (userId: string) =>
  await loyaltyService.getTotalRedeemablePoints(userId)

const cartStatus = async (cartId: number) =>
  (await db.select().from(carts).where(eq(carts.id, cartId)))[0].status

const ordersForCart = async (cartId: number) =>
  await db.select().from(orders).where(eq(orders.cartId, cartId))

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

// Every test starts from 13% added on top, untaxed shipping, 1 point = 1
beforeEach(async () => {
  await new TaxService(db).updateSettings({
    pricesIncludeTax: false,
    defaultRate: '13',
    taxShipping: false,
  })
  await loyaltyService.updateSettings({ isEnabled: true, redeemRate: '1' })
})

test('should redeem points as a discount that reduces the taxed amount', async () => {
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])

  const order = await orderService.createFromCart(cart.id, { redeemPoints: 20 })

  expect(Number(order.loyaltyDiscount)).toBe(20)
  // 13% of 80
  expect(Number(order.tax)).toBe(10.4)
  expect(Number(order.total)).toBe(90.4)
  expect(await balance(userId)).toBe(980)
  const logs = await loyaltyService.getLogs(userId)
  expect(logs.map((l) => [l.type, Number(l.points), l.orderId])).toEqual([
    ['redeemed', 20, order.id],
  ])
})

test('should spread the points discount across lines with different rates', async () => {
  const exemptClass = await new ProductClassService(db).create({
    name: unique('exempt'),
    slug: unique('exempt'),
    taxRate: '0',
  })
  const taxed = await createProduct('100')
  const exempt = await createProduct('100', exemptClass.id)
  const { cart } = await setUp([
    { variantId: taxed.variants[0].id, quantity: 1 },
    { variantId: exempt.variants[0].id, quantity: 1 },
  ])

  const order = await orderService.createFromCart(cart.id, { redeemPoints: 50 })

  // 25 off each line: 13% of 75 on the taxed one
  expect(Number(order.tax)).toBe(9.75)
  expect(Number(order.total)).toBe(159.75)
})

test('should not let points pay for shipping', async () => {
  await new TaxService(db).updateSettings({ taxShipping: true })
  const product = await createProduct('100')
  const method = await new ShippingMethodService(db).create({ name: 'Courier', price: '50' })
  const { cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])

  await expect(
    orderService.createFromCart(cart.id, { shippingMethodId: method.id, redeemPoints: 101 }),
  ).rejects.toThrow("Points are worth more than the order's products")
  expect(await ordersForCart(cart.id)).toEqual([])

  const order = await orderService.createFromCart(cart.id, {
    shippingMethodId: method.id,
    redeemPoints: 100,
  })
  // Only shipping and its tax are left
  expect(Number(order.tax)).toBe(6.5)
  expect(Number(order.total)).toBe(56.5)
})

test('should apply points after offer discounts', async () => {
  await createVoucher('LOYALTY10', '10')
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])
  const content = await cartService.getCartContentForSession(cart.sessionId)
  await new OfferService(db).applyVoucherCode(content, undefined, 'LOYALTY10', userId)

  await expect(orderService.createFromCart(cart.id, { redeemPoints: 91 })).rejects.toThrow(
    "Points are worth more than the order's products",
  )
  const order = await orderService.createFromCart(cart.id, { redeemPoints: 90 })
  expect(Number(order.total)).toBe(0)
})

test('should reject redeeming more points than the balance and write nothing', async () => {
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }], '10')

  await expect(orderService.createFromCart(cart.id, { redeemPoints: 20 })).rejects.toThrow(
    'Insufficient loyalty points',
  )
  expect(await ordersForCart(cart.id)).toEqual([])
  expect(await cartStatus(cart.id)).toBe('Open')
  expect(await balance(userId)).toBe(10)
})

test('should reject redeeming points for guests and when loyalty is disabled', async () => {
  const product = await createProduct('100')
  const guestCart = await cartService.create()
  await cartService.addToCart(guestCart.id, product.variants[0].id, 1)
  await expect(
    orderService.createFromCart(guestCart.id, { redeemPoints: 10 }),
  ).rejects.toThrow('Guests cannot redeem loyalty points')

  await loyaltyService.updateSettings({ isEnabled: false })
  const { cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])
  await expect(orderService.createFromCart(cart.id, { redeemPoints: 10 })).rejects.toThrow(
    'Loyalty points cannot be redeemed',
  )
})

test('should preview points in the cart summary without redeeming them', async () => {
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 2 }])

  const summary = await cartService.getCartSummary(cart.sessionId, { redeemPoints: 50 })
  expect(Number(summary.loyaltyDiscount)).toBe(50)
  expect(await balance(userId)).toBe(1000)

  const order = await orderService.createFromCart(cart.id, {
    redeemPoints: 50,
    expectedTotal: summary.total,
  })
  expect(Number(order.total)).toBe(Number(summary.total))
  expect(Number(order.tax)).toBe(Number(summary.tax))
})

test('should give the points back when the order is cancelled', async () => {
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])
  const order = await orderService.createFromCart(cart.id, { redeemPoints: 30 })
  expect(await balance(userId)).toBe(970)

  await orderService.cancel(order.id, 'admin', 'Customer request')

  expect(await balance(userId)).toBe(1000)
  const unredeemed = await db
    .select()
    .from(loyaltyLogs)
    .where(and(eq(loyaltyLogs.orderId, order.id), eq(loyaltyLogs.type, 'unredeemed')))
  expect(unredeemed.map((l) => Number(l.points))).toEqual([30])
})

test('should cancel an order without points without touching loyalty', async () => {
  const product = await createProduct('100')
  const { userId, cart } = await setUp([{ variantId: product.variants[0].id, quantity: 1 }])
  const order = await orderService.createFromCart(cart.id)

  await orderService.cancel(order.id, 'admin', 'Customer request')

  expect(await balance(userId)).toBe(1000)
  expect(await loyaltyService.getLogs(userId)).toEqual([])
})
