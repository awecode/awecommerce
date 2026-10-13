import { beforeAll, expect, test, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'

import { db } from 'core/db'
import { OrderService, OrderTotalMismatchError } from 'apps/order/services/order'
import { ShippingMethodService } from 'apps/order/services/shipping-method'
import { CartService } from 'apps/cart/services/cart'
import { OfferService } from 'apps/offer/services/offer'
import { ProductService } from 'apps/product/services/product'
import { carts } from 'apps/cart/schemas'
import { orderLines, orders } from 'apps/order/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offerUsages,
  offers,
} from 'apps/offer/schemas'

const orderService = new OrderService(db)
const cartService = new CartService(db)
const productService = new ProductService(db)

let productCount = 0
const createProduct = async (price: string | undefined, discountedPrice?: string) => {
  productCount++
  const slug = `from-cart-product-${productCount}`
  return await productService.create({
    name: `From Cart Product ${productCount}`,
    slug,
    sku: `SKU-${productCount}`,
    price,
    discountedPrice,
  })
}

const createCart = async (
  userId: string | undefined,
  items: Array<{ productId: number; quantity: number }>,
) => {
  const cart = await cartService.create(userId)
  for (const item of items) {
    await cartService.addToCart(cart.id, item.productId, item.quantity)
  }
  return cart
}

const createVoucher = async (
  voucherCode: string,
  percentage: string,
  limits: { limitPerUser?: number; overallLimit?: number } = {},
) => {
  const [range] = await db
    .insert(offerRanges)
    .values({
      name: `Range ${voucherCode}`,
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
    .values({ name: `Benefit ${voucherCode}`, type: 'percentage', value: percentage })
    .returning()
  const [offer] = await db
    .insert(offers)
    .values({
      name: `Voucher ${voucherCode}`,
      type: 'voucher',
      voucherCode,
      includeAllUsers: true,
      conditionId: condition.id,
      benefitId: benefit.id,
      ...limits,
    })
    .returning()
  return offer
}

// A user offer for one user only, so it does not apply to other tests' orders
const createUserOffer = async (userId: string, percentage: string) => {
  const voucher = await createVoucher(`USER-${userId}`, percentage)
  const [offer] = await db
    .update(offers)
    .set({
      type: 'user',
      voucherCode: null,
      includeAllUsers: false,
      includedUserIds: [userId],
    })
    .where(eq(offers.id, voucher.id))
    .returning()
  return offer
}

const applyVoucher = async (cartSessionId: string, code: string, userId?: string) => {
  const content = await cartService.getCartContentForSession(cartSessionId)
  await new OfferService(db).applyVoucherCode(content, undefined, code, userId)
}

const usage = async (offerId: number, userId: string) => {
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId))
  const [userUsage] = await db
    .select()
    .from(offerUsages)
    .where(and(eq(offerUsages.offerId, offerId), eq(offerUsages.userId, userId)))
  return { total: offer.usageCount, user: userUsage?.usageCount ?? 0 }
}

const cartStatus = async (cartId: number) =>
  (await db.select().from(carts).where(eq(carts.id, cartId)))[0].status

const ordersForCart = async (cartId: number) =>
  await db.select().from(orders).where(eq(orders.cartId, cartId))

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

test('should create an order from a cart with prices from the database', async () => {
  const userId = 'from-cart-user'
  const saleProduct = await createProduct('100', '80')
  const plainProduct = await createProduct('50')
  const cart = await createCart(userId, [
    { productId: saleProduct.id, quantity: 3 },
    { productId: plainProduct.id, quantity: 1 },
  ])

  const order = await orderService.createFromCart(cart.id)

  expect(order.userId).toBe(userId)
  expect(order.cartId).toBe(cart.id)
  expect(order.status).toBe('Pending')
  const lines = [...order.lines].sort((a, b) => a.productId - b.productId)
  expect(
    lines.map((l) => [l.productId, Number(l.price), Number(l.discount), l.quantity]),
  ).toEqual([
    [saleProduct.id, 100, 20, 3],
    [plainProduct.id, 50, 0, 1],
  ])
  // 3 x 80 + 1 x 50
  expect(Number(order.total)).toBe(290)
  expect(orderService.checkHash(order.id.toString(), order.hash)).toBe(true)
  expect(await cartStatus(cart.id)).toBe('Frozen')
  const logs = await orderService.getLogs(order.id)
  expect(logs.map((l) => [l.log, l.loggedBy])).toEqual([['Order received', userId]])
})

test('should use the current price, not the price when the item was added', async () => {
  const product = await createProduct('100')
  const cart = await createCart('from-cart-price-change-user', [
    { productId: product.id, quantity: 1 },
  ])
  await productService.update(product.id, { price: '120' })

  const order = await orderService.createFromCart(cart.id)

  expect(Number(order.lines[0].price)).toBe(120)
  expect(Number(order.total)).toBe(120)
})

test('should keep the product name and sku on the order line', async () => {
  const product = await createProduct('30')
  const cart = await createCart('from-cart-snapshot-user', [
    { productId: product.id, quantity: 1 },
  ])
  const order = await orderService.createFromCart(cart.id)
  await productService.update(product.id, { name: 'Renamed Product', sku: 'RENAMED' })

  const [line] = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id))
  expect(line.productName).toBe(product.name)
  expect(line.productSku).toBe(product.sku)
})

test('should apply voucher discounts and record the applied offers', async () => {
  const userId = 'from-cart-voucher-user'
  const product = await createProduct('200')
  const cart = await createCart(userId, [{ productId: product.id, quantity: 1 }])
  const voucher = await createVoucher('FROMCART10', '10')
  const content = await cartService.getCartContentForSession(cart.sessionId)
  await new OfferService(db).applyVoucherCode(content, undefined, 'FROMCART10', userId)

  const order = await orderService.createFromCart(cart.id)

  expect(Number(order.discount)).toBe(20)
  expect(order.offers!.map((o) => [o.id, o.voucherCode, o.discount])).toEqual([
    [voucher.id, 'FROMCART10', 20],
  ])
  expect(Number(order.total)).toBe(180)
})

test('should add the shipping method charge and keep its details', async () => {
  const product = await createProduct('40')
  const cart = await createCart('from-cart-shipping-user', [
    { productId: product.id, quantity: 2 },
  ])
  const method = await new ShippingMethodService(db).create({ name: 'Express', price: '15' })
  const shippingAddress = { city: 'Kathmandu', line1: 'Street 1' }

  const order = await orderService.createFromCart(cart.id, {
    shippingMethodId: method.id,
    shippingAddress,
  })

  expect(Number(order.shippingCharge)).toBe(15)
  expect(order.shippingMethod).toMatchObject({ id: method.id, name: 'Express' })
  expect(Number(order.shippingMethod!.price)).toBe(15)
  expect(order.shippingAddress).toEqual(shippingAddress)
  expect(Number(order.total)).toBe(95)
})

test('should reject an unknown shipping method and write nothing', async () => {
  const product = await createProduct('40')
  const cart = await createCart('from-cart-bad-shipping-user', [
    { productId: product.id, quantity: 1 },
  ])
  await expect(
    orderService.createFromCart(cart.id, { shippingMethodId: 999999 }),
  ).rejects.toThrow('Shipping method not found: 999999')
  expect(await ordersForCart(cart.id)).toEqual([])
  expect(await cartStatus(cart.id)).toBe('Open')
})

test('should create the order when the expected total matches', async () => {
  const product = await createProduct('25')
  const cart = await createCart('from-cart-expected-user', [
    { productId: product.id, quantity: 4 },
  ])
  const order = await orderService.createFromCart(cart.id, { expectedTotal: '100' })
  expect(Number(order.total)).toBe(100)
})

test('should reject when the expected total differs and write nothing', async () => {
  const product = await createProduct('25')
  const cart = await createCart('from-cart-mismatch-user', [
    { productId: product.id, quantity: 4 },
  ])
  await productService.update(product.id, { price: '30' })

  const error = await orderService
    .createFromCart(cart.id, { expectedTotal: 100 })
    .catch((e) => e)

  expect(error).toBeInstanceOf(OrderTotalMismatchError)
  expect(error.message).toBe('Order total changed: expected 100, got 120')
  expect([error.expectedTotal, error.actualTotal]).toEqual(['100', '120'])
  expect(await ordersForCart(cart.id)).toEqual([])
  expect(await cartStatus(cart.id)).toBe('Open')
})

test('should reject a cart that is not open, so it cannot be ordered twice', async () => {
  const product = await createProduct('10')
  const cart = await createCart('from-cart-twice-user', [
    { productId: product.id, quantity: 1 },
  ])
  await orderService.createFromCart(cart.id)
  await expect(orderService.createFromCart(cart.id)).rejects.toThrow(
    `Cart is not open: ${cart.id}`,
  )
  expect(await ordersForCart(cart.id)).toHaveLength(1)
})

test('should reject a missing cart and an empty cart', async () => {
  await expect(orderService.createFromCart(999999)).rejects.toThrow(
    'Cart not found: 999999',
  )
  const cart = await createCart('from-cart-empty-user', [])
  await expect(orderService.createFromCart(cart.id)).rejects.toThrow(
    'Cannot create an order without lines',
  )
  expect(await cartStatus(cart.id)).toBe('Open')
})

test('should create a guest order with the guest details', async () => {
  const product = await createProduct('10')
  const cart = await createCart(undefined, [{ productId: product.id, quantity: 1 }])
  const guestUser = { name: 'Guest', email: 'guest@example.com' }

  const order = await orderService.createFromCart(cart.id, {
    guestUser,
    metadata: { source: 'web' },
  })

  expect(order.userId).toBeNull()
  expect(order.guestUser).toEqual(guestUser)
  expect(order.metadata).toEqual({ source: 'web' })
})

test('should store a line without any price as null and count it as zero', async () => {
  const priced = await createProduct('10')
  const unpriced = await createProduct('20')
  const cart = await createCart('from-cart-no-price-user', [
    { productId: priced.id, quantity: 1 },
    { productId: unpriced.id, quantity: 1 },
  ])
  await productService.update(unpriced.id, { price: null })

  const order = await orderService.createFromCart(cart.id)

  const line = order.lines.find((l) => l.productId === unpriced.id)!
  expect(line.price).toBeNull()
  expect(Number(order.total)).toBe(10)
})

test('should record voucher usage so its per-user limit is used up', async () => {
  const userId = 'from-cart-usage-user'
  const product = await createProduct('100')
  const voucher = await createVoucher('ONCE10', '10', { limitPerUser: 1 })
  const cart = await createCart(userId, [{ productId: product.id, quantity: 1 }])
  await applyVoucher(cart.sessionId, 'ONCE10', userId)

  await orderService.createFromCart(cart.id)

  expect(await usage(voucher.id, userId)).toEqual({ total: 1, user: 1 })
  const nextCart = await createCart(userId, [{ productId: product.id, quantity: 1 }])
  await expect(applyVoucher(nextCart.sessionId, 'ONCE10', userId)).rejects.toThrow(
    'Voucher code usage limit exceeded',
  )
})

test('should count an offer once even when it discounts several lines', async () => {
  const userId = 'from-cart-usage-lines-user'
  const first = await createProduct('100')
  const second = await createProduct('50')
  const voucher = await createVoucher('LINES10', '10')
  const cart = await createCart(userId, [
    { productId: first.id, quantity: 1 },
    { productId: second.id, quantity: 2 },
  ])
  await applyVoucher(cart.sessionId, 'LINES10', userId)

  await orderService.createFromCart(cart.id)

  expect(await usage(voucher.id, userId)).toEqual({ total: 1, user: 1 })
})

test('should record usage of user offers', async () => {
  const userId = 'from-cart-user-offer-user'
  const product = await createProduct('100')
  const userOffer = await createUserOffer(userId, '5')
  const cart = await createCart(userId, [{ productId: product.id, quantity: 1 }])

  const order = await orderService.createFromCart(cart.id)

  expect(order.offers!.map((o) => o.id)).toContain(userOffer.id)
  expect(await usage(userOffer.id, userId)).toEqual({ total: 1, user: 1 })
})

test('should count a guest voucher order towards the overall limit only', async () => {
  const product = await createProduct('100')
  const voucher = await createVoucher('GUEST10', '10', { overallLimit: 1 })
  const cart = await createCart(undefined, [{ productId: product.id, quantity: 1 }])
  await applyVoucher(cart.sessionId, 'GUEST10')

  await orderService.createFromCart(cart.id, { guestUser: { email: 'guest@example.com' } })

  const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
  expect(offer.usageCount).toBe(1)
  expect(
    await db.select().from(offerUsages).where(eq(offerUsages.offerId, voucher.id)),
  ).toEqual([])
  const nextCart = await createCart(undefined, [{ productId: product.id, quantity: 1 }])
  await expect(applyVoucher(nextCart.sessionId, 'GUEST10')).rejects.toThrow(
    'Voucher code usage limit exceeded',
  )
})

test('should not record usage when the order is not created', async () => {
  const userId = 'from-cart-usage-rollback-user'
  const product = await createProduct('100')
  const voucher = await createVoucher('ROLLBACK10', '10')
  const cart = await createCart(userId, [{ productId: product.id, quantity: 1 }])
  await applyVoucher(cart.sessionId, 'ROLLBACK10', userId)

  // Fails after usage was recorded, so the whole order must roll back
  const spy = vi
    .spyOn(OrderService.prototype, 'createLog')
    .mockRejectedValueOnce(new Error('log failed'))
  await expect(orderService.createFromCart(cart.id)).rejects.toThrow('log failed')
  spy.mockRestore()

  expect(await usage(voucher.id, userId)).toEqual({ total: 0, user: 0 })
  expect(await ordersForCart(cart.id)).toEqual([])
})

const orderWithVoucher = async (code: string, userId: string | undefined, productId: number) => {
  const cart = await createCart(userId, [{ productId, quantity: 1 }])
  await applyVoucher(cart.sessionId, code, userId)
  return await orderService.createFromCart(
    cart.id,
    userId ? {} : { guestUser: { email: 'guest@example.com' } },
  )
}

test('should give voucher usage back when an order is cancelled', async () => {
  const userId = 'cancel-usage-user'
  const product = await createProduct('100')
  const voucher = await createVoucher('CANCEL10', '10', { limitPerUser: 1 })
  const order = await orderWithVoucher('CANCEL10', userId, product.id)

  await orderService.cancel(order.id, 'admin', 'Customer request')

  expect(await usage(voucher.id, userId)).toEqual({ total: 0, user: 0 })
  // The voucher can be used again
  await orderWithVoucher('CANCEL10', userId, product.id)
  expect(await usage(voucher.id, userId)).toEqual({ total: 1, user: 1 })
})

test('should give overall usage back when a guest order is cancelled', async () => {
  const product = await createProduct('100')
  const voucher = await createVoucher('GUESTCANCEL', '10', { overallLimit: 1 })
  const order = await orderWithVoucher('GUESTCANCEL', undefined, product.id)

  await orderService.cancel(order.id, 'admin', 'Customer request')

  const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
  expect(offer.usageCount).toBe(0)
  await orderWithVoucher('GUESTCANCEL', undefined, product.id)
})

test('should reject cancelling an order twice and give usage back only once', async () => {
  const product = await createProduct('100')
  const voucher = await createVoucher('TWICECANCEL', '10')
  const order = await orderWithVoucher('TWICECANCEL', 'cancel-twice-user', product.id)
  await orderWithVoucher('TWICECANCEL', 'cancel-twice-other-user', product.id)

  await orderService.cancel(order.id, 'admin', 'Customer request')
  await expect(
    orderService.cancel(order.id, 'admin', 'Again'),
  ).rejects.toThrow(`Order is already cancelled: ${order.id}`)

  expect(await usage(voucher.id, 'cancel-twice-user')).toEqual({ total: 1, user: 0 })
  expect(await usage(voucher.id, 'cancel-twice-other-user')).toEqual({ total: 1, user: 1 })
})

test('should keep usage when cancelling fails', async () => {
  const userId = 'cancel-rollback-user'
  const product = await createProduct('100')
  const voucher = await createVoucher('CANCELFAIL', '10')
  const order = await orderWithVoucher('CANCELFAIL', userId, product.id)

  const spy = vi
    .spyOn(OrderService.prototype, 'changeStatus')
    .mockRejectedValueOnce(new Error('status change failed'))
  await expect(
    orderService.cancel(order.id, 'admin', 'Customer request'),
  ).rejects.toThrow('status change failed')
  spy.mockRestore()

  expect(await usage(voucher.id, userId)).toEqual({ total: 1, user: 1 })
  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.status).toBe('Pending')
})
