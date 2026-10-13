// Runs only against a real Postgres (see loyalty-concurrency.test.ts), because
// PGlite cannot run transactions at the same time. Use `pnpm test:pg`.
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import { OrderService } from 'apps/order/services/order'
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
      name: slug,
      slug,
      sku: slug,
      price: '10',
    })
    const cartService = new CartService(db)
    const cart = await cartService.create(slug)
    await cartService.addToCart(cart.id, product.id, 1)

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
      await cartService.addToCart(cart.id, product.id, 1)
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
      name: slug,
      slug,
      sku: slug,
      price: '10',
    })
    const cartService = new CartService(db)
    const cart = await cartService.create(slug)
    await cartService.addToCart(cart.id, product.id, 1)
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
})
