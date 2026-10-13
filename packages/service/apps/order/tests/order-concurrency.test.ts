// Runs only against a real Postgres (see loyalty-concurrency.test.ts), because
// PGlite cannot run transactions at the same time. Use `pnpm test:pg`.
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import { OrderService } from 'apps/order/services/order'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { carts } from 'apps/cart/schemas'
import { orders } from 'apps/order/schemas'

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
})
