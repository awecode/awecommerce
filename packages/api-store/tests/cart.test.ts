import { fetch } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { productVariants } from '@awecommerce/service/apps/product/schemas'
import { buyer, createProduct, createVoucher, setupApi, url } from './helpers'

describe.skipIf(!url)('store cart API', async () => {
  const db = await setupApi()

  test('a new buyer has no cart until the first add, which sets the cookie', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '10')

    // No cart: 204 with no body
    expect((await request('/api/store/cart')).status).toBe(204)

    const added = await request('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId, quantity: 2 },
    })
    expect(added.status).toBe(200)
    expect(added.setCookie).toMatch(/^awe_cart=[0-9a-f-]{36};.*HttpOnly/i)
    expect(added.body.lines.map((l: any) => [l.variantId, l.quantity])).toEqual([[variantId, 2]])
    expect(added.body.lines[0].isAvailable).toBe(true)
    expect(Number(added.body.total)).toBe(20)

    const again = await request('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId, quantity: 1 },
    })
    expect(again.setCookie).toBeNull()
    expect(again.body.lines.map((l: any) => l.quantity)).toEqual([3])
    expect((await request('/api/store/cart')).body.id).toBe(added.body.id)
  })

  test('refuses more than is in stock, and checkout fails when stock runs out', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '10')
    await db.update(productVariants).set({ stockQuantity: 2 }).where(eq(productVariants.id, variantId))

    const tooMany = await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 3 } })
    expect(tooMany.status).toBe(409)
    expect(tooMany.body.message).toMatch(/^Only 2 left of /)
    expect(tooMany.body.data).toMatchObject({ code: 'OutOfStockError', variantId, available: 2 })

    await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 2 } })
    await db.update(productVariants).set({ stockQuantity: 1 }).where(eq(productVariants.id, variantId))
    const cart = (await request('/api/store/cart')).body
    expect(cart.lines[0]).toMatchObject({ isInStock: false, stockLeft: 1 })

    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: {
        expectedTotal: cart.total,
        shippingAddress: { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' },
        guestUser: { name: 'Ann', email: 'ann@example.com' },
      },
    })
    expect(placed.status).toBe(409)
    expect(placed.body.data).toMatchObject({ code: 'OutOfStockError', available: 1 })
  })

  test('changes quantity and answers, merges matching lines, and removes lines', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '5', [{ label: 'Name', required: true, maxLength: 10 }])
    await request('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId, quantity: 1, customizations: { Name: 'Ann' } },
    })
    const added = await request('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId, quantity: 2, customizations: { Name: 'Bob' } },
    })
    const [ann, bob] = added.body.lines

    const quantity = await request(`/api/store/cart/lines/${ann.id}`, {
      method: 'PATCH',
      body: { quantity: 4 },
    })
    expect(quantity.body.lines.find((l: any) => l.id === ann.id).quantity).toBe(4)

    const merged = await request(`/api/store/cart/lines/${ann.id}`, {
      method: 'PATCH',
      body: { customizations: { Name: 'Bob' } },
    })
    expect(merged.body.lines.map((l: any) => [l.id, l.quantity])).toEqual([[bob.id, 6]])

    const removed = await request(`/api/store/cart/lines/${bob.id}`, { method: 'DELETE' })
    expect(removed.body.lines).toEqual([])
  })

  test('a rejected answer leaves the quantity unchanged', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '5', [{ label: 'Name', required: true, maxLength: 3 }])
    const added = await request('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId, quantity: 1, customizations: { Name: 'Ann' } },
    })
    const lineId = added.body.lines[0].id

    const rejected = await request(`/api/store/cart/lines/${lineId}`, {
      method: 'PATCH',
      body: { quantity: 9, customizations: { Name: 'Too long' } },
    })
    expect(rejected.status).toBe(422)
    expect((await request('/api/store/cart')).body.lines[0].quantity).toBe(1)
  })

  test('applies and removes a voucher', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '100')
    const { code } = await createVoucher(db, variantId, '10')
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })

    const applied = await request('/api/store/cart/vouchers', { method: 'POST', body: { code } })
    expect(applied.status).toBe(200)
    expect(applied.body.voucherOfferDiscounts.map((d: any) => d.voucherCode)).toEqual([code])
    expect(Number(applied.body.total)).toBe(90)
    // Still applied when the cart is read again
    expect(Number((await request('/api/store/cart')).body.total)).toBe(90)

    const removed = await request(`/api/store/cart/vouchers/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    })
    expect(Number(removed.body.total)).toBe(100)
  })

  test('maps errors to 400, 404 and 422', async () => {
    const request = buyer()
    const variantId = await createProduct(db, '10')

    // Malformed body
    expect((await request('/api/store/cart/lines', { method: 'POST', body: { variantId: 'x' } })).status).toBe(400)
    // No cart yet
    expect((await request('/api/store/cart/lines/1', { method: 'DELETE' })).status).toBe(404)
    // Library errors
    expect((await request('/api/store/cart/lines', { method: 'POST', body: { variantId: 999999999, quantity: 1 } })).status).toBe(404)
    const zero = await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 0 } })
    expect(zero.status).toBe(422)
    expect(zero.body.message).toBe('Quantity must be at least 1')
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })
    expect((await request('/api/store/cart/lines/999999999', { method: 'DELETE' })).status).toBe(404)
    const voucher = await request('/api/store/cart/vouchers', { method: 'POST', body: { code: 'NOPE' } })
    expect(voucher.status).toBe(422)
    expect(voucher.body.message).toBe('Invalid voucher code')
  })

  test('another buyer cannot change a cart they do not hold', async () => {
    const owner = buyer()
    const other = buyer()
    const variantId = await createProduct(db, '10')
    const added = await owner('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })
    await other('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })

    const attempt = await other(`/api/store/cart/lines/${added.body.lines[0].id}`, { method: 'DELETE' })
    expect(attempt.status).toBe(404)
    expect((await owner('/api/store/cart')).body.lines).toHaveLength(1)
  })

  test('ignores a cookie that is not a cart', async () => {
    const response = await fetch('/api/store/cart', { headers: { cookie: 'awe_cart=not-a-uuid' } })
    expect(response.status).toBe(204)
  })
})
