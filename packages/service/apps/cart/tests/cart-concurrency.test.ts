// Runs only against a real Postgres (see loyalty-concurrency.test.ts), because
// PGlite cannot run transactions at the same time. Use `pnpm test:pg`.
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { cartLines } from 'apps/cart/schemas'

const url = process.env.TEST_POSTGRES_URL
const CONCURRENCY = 10

describe.skipIf(!url)('cart under real concurrency', () => {
  let pool: pg.Pool
  let db: ReturnType<typeof drizzle<typeof tables>>

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: CONCURRENCY + 2 })
    db = drizzle(pool, { schema: tables })
  })

  afterAll(async () => {
    await pool?.end()
  })

  test('concurrent adds of the same item end up on one line', async () => {
    const slug = `concurrent-add-${Date.now()}`
    const product = await new ProductService(db).create({
      status: 'Published',
      name: slug,
      slug,
      sku: slug,
      price: '10',
      customFields: [{ label: 'Print name', required: true, maxLength: 12 }],
    })
    const cart = await new CartService(db).create(slug)
    // Open every connection first, so the adds really overlap instead of
    // waiting one by one for new connections
    const clients = await Promise.all(Array.from({ length: CONCURRENCY }, () => pool.connect()))
    clients.forEach((client) => client.release())

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        new CartService(db).addToCart(cart.id, product.variants[0].id, 1, {
          'Print name': 'Dipesh',
        }),
      ),
    )

    const lines = await db.select().from(cartLines).where(eq(cartLines.cartId, cart.id))
    expect(lines.map((l) => l.quantity)).toEqual([CONCURRENCY])
  })
})
