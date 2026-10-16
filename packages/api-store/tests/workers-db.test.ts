import { describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { buyer, createProduct, setupApi, url } from './helpers'

// On Workers, a connection cannot outlive its request: each request gets its
// own, from the Hyperdrive binding, closed after the response
describe.skipIf(!url)('database on Workers with Hyperdrive', async () => {
  const appName = 'hyperdrive-test'
  process.env.TEST_HYPERDRIVE_URL = `${url}${url!.includes('?') ? '&' : '?'}application_name=${appName}`
  // Nothing listens here: only the binding can reach the database
  const db = await setupApi({ rootDir: 'workers-app', postgresUrl: 'postgres://nobody:none@127.0.0.1:1/none' })
  const open = async () =>
    Number((await db.execute(sql`SELECT count(*) AS n FROM pg_stat_activity WHERE application_name = ${appName}`)).rows[0]!.n)

  test('requests use the binding, and close their connections after the response', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '20')
    expect((await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })).status).toBe(200)
    const { total } = (await request('/api/store/cart')).body
    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: total, shippingAddress: { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' }, guestUser: { name: 'Ann', email: 'ann@example.com' } },
    })
    expect(placed.status).toBe(200)
    // Several at once, each with its own connection
    const pages = await Promise.all(Array.from({ length: 5 }, () => request('/api/store/products?size=1')))
    expect(pages.map((page) => page.status)).toEqual([200, 200, 200, 200, 200])

    await expect.poll(open, { timeout: 5000 }).toBe(0)
  })
})
