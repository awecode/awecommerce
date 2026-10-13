import { faker } from '@faker-js/faker'
import { expect, test, vi } from 'vitest'

import {db} from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { OfferService } from 'apps/offer/services/offer'
import { cartAppliedVoucherOffers, cartLines } from 'apps/cart/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offers,
} from 'apps/offer/schemas'
import { eq, sql } from 'drizzle-orm'


const cartService = new CartService(db)
const productService = new ProductService(db)


const createProduct = async () => {
  return await productService.create({
    name: faker.commerce.productName(),
    slug: faker.string.uuid(),
    sku: faker.string.uuid(),
    description: faker.commerce.productDescription(),
    price: faker.number.int({ min: 10, max: 100 }).toString(),
  })
}

test('should create a cart', async () => {
  const cart = await cartService.create()
  expect(cart).toBeDefined()
  expect(cart.id).toBeDefined()
  expect(cart.userId).toBeNull()
  expect(cart.sessionId).toBeDefined()
})

test('should add a product to the cart', async () => {
  const cart = await cartService.create()
  const product = await createProduct()
  const { price, discountedPrice } = await productService.getPrices(product.id)
  const cartLine = await cartService.addToCart(cart.id, product.id, 1)
  expect(cartLine).toBeDefined()
  expect(cartLine.cartId).toBe(cart.id)
  expect(cartLine.productId).toBe(product.id)
})

test('should get cart content for session', async () => {
  const cart = await cartService.create()
  const product1 = await createProduct()
  const product2 = await createProduct()
  await cartService.addToCart(cart.id, product1.id, 1)
  await cartService.addToCart(cart.id, product2.id, 1)
  const cartContent = await cartService.getCartContentForSession(cart.sessionId)
  expect(cartContent).toBeDefined()
  expect(cartContent).toBeDefined()
})

test('should merge carts', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  const line1 = await cartService.addToCart(cart1.id, product1.id, 2)
  const product2 = await createProduct()
  const line2 = await cartService.addToCart(cart2.id, product2.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.userId).toBe(cart1.userId)
  expect(mergedCart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(2)
  // Line 1 should not be on merged cart
  expect(mergedCart.lines.find((l) => l.id === line1.id)).toBeUndefined()
  // Product from line 1 should be on merged cart with a different line id
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id)?.id,
  ).not.toBe(line1.id)
  // Line 1's product should be on merged cart with same values except line id
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id),
  ).toBeDefined()
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id)?.quantity,
  ).toBe(line1.quantity)
  // Line 2 should be on merged cart with same id
  expect(mergedCart.lines.find((l) => l.id === line2.id)).toBeDefined()
})

test('should merge carts with same product and sum quantity', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  await cartService.addToCart(cart1.id, product1.id, 2)
  await cartService.addToCart(cart2.id, product1.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
    true,
  )
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].quantity).toBe(5)
})

test('should merge carts with same product and not sum quantity', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  await cartService.addToCart(cart1.id, product1.id, 2)
  const line2 = await cartService.addToCart(cart2.id, product1.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
    false,
  )
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].quantity).toBe(line2.quantity)
})

test('should merge carts when session cart is invalid', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const product1 = await createProduct()
  await cartService.addToCart(cart1.id, product1.id, 2)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    '123e4567-e89b-12d3-a456-426614174000', // dummy uuid
  )
  expect(mergedCart.userId).toBe(cart1.userId)
  expect(mergedCart.sessionId).toBe(cart1.sessionId)
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].productId).toBe(product1.id)
  expect(mergedCart.lines[0].quantity).toBe(2)
})

test('should return user cart for merge when session cart is empty', async () => {
  const cart1 = await cartService.create('1234') //1234 is userId
  const product1 = await createProduct()
  await cartService.addToCart(cart1.id, product1.id, 2)
  const cart2 = await cartService.create()
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.userId).toBe(cart1.userId)
  expect(mergedCart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(1)
})

test('should return session cart for merge when user cart is empty', async () => {
  const cart1 = await cartService.create('12345') //1234 is userId
  const cart2 = await cartService.create()
  const product2 = await createProduct()
  await cartService.addToCart(cart2.id, product2.id, 2)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!, // dummy uuid
    cart2.sessionId,
  )
  expect(mergedCart.userId).toBe(cart1.userId)
  expect(mergedCart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].productId).toBe(product2.id)
  expect(mergedCart.lines[0].quantity).toBe(2)
})

test('should return empty cart for merge when both user and session cart are empty', async () => {
  const cart1 = await cartService.create('123456') //12345 is userId
  const cart2 = await cartService.create()
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.userId).toBe(cart1.userId)
  expect(mergedCart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(0)
})
const createVoucher = async (voucherCode: string) => {
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
    .values({ name: `Benefit ${voucherCode}`, type: 'percentage', value: '10' })
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
    })
    .returning()
  return offer
}

const createCartWithVouchers = async (userId: string, voucherCodes: string[]) => {
  const cart = await cartService.create(userId)
  const product = await createProduct()
  await cartService.addToCart(cart.id, product.id, 1)
  const offerService = new OfferService(db)
  for (const code of voucherCodes) {
    await createVoucher(code)
    const content = await cartService.getCartContentForSession(cart.sessionId)
    await offerService.applyVoucherCode(content, undefined, code, userId)
  }
  return cart
}

const appliedOfferIds = async (cartId: number) =>
  (
    await db
      .select()
      .from(cartAppliedVoucherOffers)
      .where(eq(cartAppliedVoucherOffers.cartId, cartId))
  ).map((row) => row.offerId)

test('should roll back clearing a cart when resetting vouchers fails', async () => {
  const cart = await createCartWithVouchers('clear-rollback-user', ['CLEAR10'])
  const spy = vi
    .spyOn(CartService.prototype, 'resetAppliedVoucherOffers')
    .mockRejectedValueOnce(new Error('reset failed'))
  await expect(cartService.clearCart(cart.id)).rejects.toThrow('reset failed')
  spy.mockRestore()
  expect(
    await db.select().from(cartLines).where(eq(cartLines.cartId, cart.id)),
  ).toHaveLength(1)
  expect(await appliedOfferIds(cart.id)).toHaveLength(1)
})

test('should keep applied vouchers when reading cart content with offers', async () => {
  const cart = await createCartWithVouchers('voucher-keep-user', ['KEEP10'])
  const before = await appliedOfferIds(cart.id)
  const content = await cartService.getCartContentForSession(cart.sessionId, true)
  expect(content.voucherOfferDiscounts.map((d) => d.voucherCode)).toEqual(['KEEP10'])
  expect(await appliedOfferIds(cart.id)).toEqual(before)
})

test('should keep other vouchers when re-applying one fails with a database error', async () => {
  const cart = await createCartWithVouchers('voucher-dberror-user', ['FIRST10', 'SECOND10'])
  const original = OfferService.prototype.applyVoucherCode
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const spy = vi
    .spyOn(OfferService.prototype, 'applyVoucherCode')
    .mockImplementationOnce(async function (this: any) {
      await this.db.execute(sql`select * from table_that_does_not_exist`)
      throw new Error('unreachable')
    })
    .mockImplementation(function (this: any, ...args: any[]) {
      return original.apply(this, args as any)
    })
  const content = await cartService.getCartContentForSession(cart.sessionId, true)
  spy.mockRestore()
  consoleSpy.mockRestore()
  expect(content.voucherOfferDiscounts.map((d) => d.voucherCode)).toEqual(['SECOND10'])
  expect(await appliedOfferIds(cart.id)).toHaveLength(1)
})
