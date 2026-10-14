// Runs only against a real Postgres (see loyalty-concurrency.test.ts), because
// PGlite cannot run transactions at the same time. Use `pnpm test:pg`.
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import {
  OfferLimitReachedError,
  OrderService,
  VoucherNoLongerValidError,
} from 'apps/order/services/order'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { carts } from 'apps/cart/schemas'
import { orders, orderStatusChanges } from 'apps/order/schemas'
import {
  offerBenefits,
  offerConditions,
  offerRanges,
  offerUsages,
  offers,
} from 'apps/offer/schemas'
import { OfferService } from 'apps/offer/services/offer'

const url = process.env.TEST_POSTGRES_URL
const CONCURRENCY = 5

describe.skipIf(!url)('orders under real concurrency', () => {
  let pool: pg.Pool
  let db: ReturnType<typeof drizzle<typeof tables>>

  beforeAll(async () => {
    process.env.ORDER_HASH_SECRET = 'test-secret'
    pool = new pg.Pool({ connectionString: url, max: CONCURRENCY + 2 })
    db = drizzle(pool, { schema: tables })
  })

  afterAll(async () => {
    await pool?.end()
  })

  test('concurrent checkouts of one cart create exactly one order', async () => {
    const slug = `concurrent-checkout-${Date.now()}`
    const product = await new ProductService(db).create({
      status: 'Published',
      name: slug,
      slug,
      sku: slug,
      price: '10',
    })
    const cartService = new CartService(db)
    const cart = await cartService.create(slug)
    await cartService.addToCart(cart.id, product.variants[0].id, 1)

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        new OrderService(db).createFromCart(cart.id),
      ),
    )

    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason.message)
    expect(results.length - reasons.length).toBe(1)
    expect(reasons).toEqual(Array(CONCURRENCY - 1).fill(`Cart is not open: ${cart.id}`))
    expect(await db.select().from(orders).where(eq(orders.cartId, cart.id))).toHaveLength(1)
    const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
    expect(cartAfter.status).toBe('Frozen')
  })

  test('concurrent cancels of one order cancel it once and give usage back once', async () => {
    const slug = `concurrent-cancel-${Date.now()}`
    const product = await new ProductService(db).create({
      status: 'Published',
      name: slug,
      slug,
      sku: slug,
      price: '100',
    })
    const [range] = await db
      .insert(offerRanges)
      .values({
        name: slug,
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
      .values({ name: slug, type: 'percentage', value: '10' })
      .returning()
    const [voucher] = await db
      .insert(offers)
      .values({
        name: slug,
        type: 'voucher',
        voucherCode: slug,
        includeAllUsers: true,
        conditionId: condition.id,
        benefitId: benefit.id,
      })
      .returning()

    const cartService = new CartService(db)
    const placeOrder = async (userId: string) => {
      const cart = await cartService.create(userId)
      await cartService.addToCart(cart.id, product.variants[0].id, 1)
      const content = await cartService.getCartContentForSession(cart.sessionId)
      await new OfferService(db).applyVoucherCode(content, undefined, slug, userId)
      return await new OrderService(db).createFromCart(cart.id)
    }
    const order = await placeOrder(`${slug}-user`)
    await placeOrder(`${slug}-other-user`)

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        new OrderService(db).cancel(order.id, 'admin', 'reason'),
      ),
    )

    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason.message)
    expect(results.length - reasons.length).toBe(1)
    expect(reasons).toEqual(
      Array(CONCURRENCY - 1).fill(`Order is already cancelled: ${order.id}`),
    )
    const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
    expect(offer.usageCount).toBe(1)
    const [userUsage] = await db
      .select()
      .from(offerUsages)
      .where(and(eq(offerUsages.offerId, voucher.id), eq(offerUsages.userId, `${slug}-user`)))
    expect(userUsage.usageCount).toBe(0)
  })

  test('concurrent status changes to the same status record it once', async () => {
    const slug = `concurrent-status-${Date.now()}`
    const product = await new ProductService(db).create({
      status: 'Published',
      name: slug,
      slug,
      sku: slug,
      price: '10',
    })
    const cartService = new CartService(db)
    const cart = await cartService.create(slug)
    await cartService.addToCart(cart.id, product.variants[0].id, 1)
    const order = await new OrderService(db).createFromCart(cart.id)

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        new OrderService(db).changeStatus(order.id, 'Confirmed', 'admin'),
      ),
    )

    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason.message)
    expect(results.length - reasons.length).toBe(1)
    expect(reasons).toEqual(
      Array(CONCURRENCY - 1).fill(`Order is already Confirmed: ${order.id}`),
    )
    const history = await db
      .select()
      .from(orderStatusChanges)
      .where(eq(orderStatusChanges.orderId, order.id))
    expect(history.map((c) => [c.previousStatus, c.newStatus])).toEqual([
      ['Pending', 'Confirmed'],
    ])
  })

  // A 10% voucher on everything, with the given limits
  const createLimitedVoucher = async (
    code: string,
    limits: { overallLimit?: number; limitPerUser?: number },
  ) => {
    const [range] = await db
      .insert(offerRanges)
      .values({
        name: code,
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
      .values({ name: code, type: 'percentage', value: '10' })
      .returning()
    const [voucher] = await db
      .insert(offers)
      .values({
        name: code,
        type: 'voucher',
        voucherCode: code,
        includeAllUsers: true,
        conditionId: condition.id,
        benefitId: benefit.id,
        ...limits,
      })
      .returning()
    return voucher
  }

  // Carts that all have the voucher applied, before anyone checks out
  const cartsWithVoucher = async (code: string, userIds: string[]) => {
    const product = await new ProductService(db).create({
      status: 'Published',
      name: code,
      slug: code,
      sku: code,
      price: '100',
    })
    const cartService = new CartService(db)
    const cartIds: number[] = []
    for (const userId of userIds) {
      const cart = await cartService.create(userId)
      await cartService.addToCart(cart.id, product.variants[0].id, 1)
      const content = await cartService.getCartContentForSession(cart.sessionId)
      await new OfferService(db).applyVoucherCode(content, undefined, code, userId)
      cartIds.push(cart.id)
    }
    return cartIds
  }

  // Returns how many checkouts were rejected. Each must be rejected with the
  // given error, never placed without the offer.
  const checkOutAll = async (cartIds: number[], expectedError: Function) => {
    const results = await Promise.allSettled(
      cartIds.map((cartId) => new OrderService(db).createFromCart(cartId)),
    )
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )
    for (const { reason } of rejected) {
      expect(reason).toBeInstanceOf(expectedError)
    }
    return rejected.length
  }

  const ordersUsingOffer = async (cartIds: number[], offerId: number) =>
    (await db.select().from(orders).where(inArray(orders.cartId, cartIds))).filter(
      (order) => (order.offers ?? []).some((offer) => offer.id === offerId),
    ).length

  test('concurrent checkouts never use a voucher beyond its overall limit', async () => {
    const code = `OVERALL-${Date.now()}`
    const voucher = await createLimitedVoucher(code, { overallLimit: 1 })
    const userIds = Array.from({ length: CONCURRENCY }, (_, i) => `${code}-user-${i}`)
    const cartIds = await cartsWithVoucher(code, userIds)

    const rejected = await checkOutAll(cartIds, VoucherNoLongerValidError)

    const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
    expect(offer.usageCount).toBe(1)
    expect(await ordersUsingOffer(cartIds, voucher.id)).toBe(1)
    expect(rejected).toBe(CONCURRENCY - 1)
  })

  test('concurrent checkouts by one user never exceed the per-user limit', async () => {
    const code = `PERUSER-${Date.now()}`
    const userId = `${code}-user`
    const voucher = await createLimitedVoucher(code, { limitPerUser: 1 })
    const cartIds = await cartsWithVoucher(code, Array(CONCURRENCY).fill(userId))

    const rejected = await checkOutAll(cartIds, VoucherNoLongerValidError)

    const [usage] = await db
      .select()
      .from(offerUsages)
      .where(and(eq(offerUsages.offerId, voucher.id), eq(offerUsages.userId, userId)))
    expect(usage.usageCount).toBe(1)
    expect(await ordersUsingOffer(cartIds, voucher.id)).toBe(1)
    expect(rejected).toBe(CONCURRENCY - 1)
  })

  test('concurrent checkouts never use a user offer beyond its overall limit', async () => {
    const code = `USEROFFER-${Date.now()}`
    const userIds = Array.from({ length: CONCURRENCY }, (_, i) => `${code}-user-${i}`)
    const voucher = await createLimitedVoucher(code, { overallLimit: 1 })
    // Turn it into a user offer for exactly these users
    await db
      .update(offers)
      .set({ type: 'user', voucherCode: null, includeAllUsers: false, includedUserIds: userIds })
      .where(eq(offers.id, voucher.id))
    const product = await new ProductService(db).create({
      status: 'Published',
      name: code,
      slug: code,
      sku: code,
      price: '100',
    })
    const cartService = new CartService(db)
    const cartIds: number[] = []
    for (const userId of userIds) {
      const cart = await cartService.create(userId)
      await cartService.addToCart(cart.id, product.variants[0].id, 1)
      cartIds.push(cart.id)
    }

    const rejected = await checkOutAll(cartIds, OfferLimitReachedError)

    const [offer] = await db.select().from(offers).where(eq(offers.id, voucher.id))
    expect(offer.usageCount).toBe(1)
    expect(await ordersUsingOffer(cartIds, voucher.id)).toBe(1)
    // The orders that lost the race were rejected, not placed without the offer
    expect(rejected).toBe(CONCURRENCY - 1)
  })
})
