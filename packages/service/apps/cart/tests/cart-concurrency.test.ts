// Runs only against a real Postgres (see loyalty-concurrency.test.ts), because
// PGlite cannot run transactions at the same time. Use `pnpm test:pg`.
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import { CartService } from 'apps/cart/services/cart'
import { OfferService } from 'apps/offer/services/offer'
import { ProductService } from 'apps/product/services/product'
import { cartAppliedVoucherOffers, cartLines } from 'apps/cart/schemas'
import { offerBenefits, offerConditions, offerRanges, offers } from 'apps/offer/schemas'

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
      stockQuantity: 1000,
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

  test('concurrent reads of a cart all keep its voucher', async () => {
    const slug = `concurrent-read-${Date.now()}`
    const product = await new ProductService(db).create({ stockQuantity: 1000, status: 'Published', name: slug, slug, sku: slug, price: '100' })
    const [range] = await db.insert(offerRanges).values({
      name: slug, inclusiveFilter: true, includeAllProducts: true, includeAllBrands: true, includeAllCategories: true, includeAllProductClasses: true,
    }).returning()
    const [condition] = await db.insert(offerConditions).values({ rangeId: range!.id, type: 'basket_quantity', value: '1' }).returning()
    const [benefit] = await db.insert(offerBenefits).values({ name: slug, type: 'percentage', value: '10' }).returning()
    const code = slug.toUpperCase()
    await db.insert(offers).values({ name: slug, type: 'voucher', voucherCode: code, includeAllUsers: true, conditionId: condition!.id, benefitId: benefit!.id })
    const cartService = new CartService(db)
    const cart = await cartService.create(slug)
    await cartService.addToCart(cart.id, product.variants[0].id, 1)
    await new OfferService(db).applyVoucherCode(await cartService.getCartContentForSession(cart.sessionId), undefined, code, slug)
    const clients = await Promise.all(Array.from({ length: CONCURRENCY }, () => pool.connect()))
    clients.forEach((client) => client.release())

    // Each read re-applies the voucher; none may lose it, even for a moment
    const summaries = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => new CartService(db).getCartSummary(cart.sessionId)),
    )

    expect(summaries.map((s) => s.total)).toEqual(Array(CONCURRENCY).fill('90'))
    expect(await db.select().from(cartAppliedVoucherOffers).where(eq(cartAppliedVoucherOffers.cartId, cart.id))).toHaveLength(1)
  })
})
