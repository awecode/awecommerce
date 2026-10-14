import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { offers } from '@awecommerce/service/apps/offer/schemas'
import { buyer, createProduct, createVoucher, setupApi, unique, url } from './helpers'

const shippingAddress = { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' }
const guestUser = { name: 'Ann Buyer', email: 'ann@example.com' }

describe.skipIf(!url)('store checkout API', async () => {
  const db = await setupApi()

  const createShippingMethod = (price: string) =>
    new ShippingMethodService(db).create({ name: unique('ship'), price })

  // A buyer with one line in their cart
  const buyerWithCart = async (price = '40', quantity = 2) => {
    const request = buyer()
    const variantId = await createProduct(db, price)
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity } })
    return { request, variantId }
  }

  test('lists shipping methods', async () => {
    const method = await createShippingMethod('7')
    const { status, body } = await buyer()('/api/store/shipping-methods')

    expect(status).toBe(200)
    expect(body.find((m: any) => m.id === method.id).name).toBe(method.name)
  })

  test('places the order for the confirmed total and shows it by hash', async () => {
    const { request } = await buyerWithCart()
    const method = await createShippingMethod('15')
    const summary = await request(`/api/store/cart?shippingMethodId=${method.id}`)
    expect(Number(summary.body.shippingCharge)).toBe(15)
    expect(Number(summary.body.total)).toBe(95)

    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: {
        shippingMethodId: method.id,
        expectedTotal: summary.body.total,
        shippingAddress,
        guestUser,
        // Unknown fields are dropped, so a buyer cannot set this
        metadata: { injected: true },
      },
    })
    expect(placed.status).toBe(200)
    expect(Number(placed.body.total)).toBe(95)
    expect(placed.body.shippingAddress).toEqual(shippingAddress)
    expect(placed.body.guestUser).toEqual(guestUser)
    expect(placed.body.metadata).toBeNull()
    expect(placed.body.lines).toHaveLength(1)
    // The cookie is cleared and the cart is closed
    expect(placed.setCookie).toMatch(/^awe_cart=;/)
    expect((await request('/api/store/cart')).status).toBe(204)

    const { id, hash } = placed.body
    const shown = await request(`/api/store/orders/${id}?hash=${encodeURIComponent(hash)}`)
    expect(shown.status).toBe(200)
    expect(shown.body.id).toBe(id)
    expect(Number(shown.body.total)).toBe(95)
    expect((await request(`/api/store/orders/${id}?hash=wrong`)).status).toBe(404)
    // A guest without the hash would need to sign in
    expect((await request(`/api/store/orders/${id}`)).status).toBe(401)
  })

  test('refuses a total that changed, with the new total, and keeps the cart', async () => {
    const { request } = await buyerWithCart('40', 1)

    const refused = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: '39', shippingAddress, guestUser },
    })
    expect(refused.status).toBe(409)
    expect(refused.body.data).toMatchObject({ code: 'OrderTotalMismatchError', expectedTotal: '39' })
    expect(Number(refused.body.data.actualTotal)).toBe(40)
    expect((await request('/api/store/cart')).status).toBe(200)
  })

  test('refuses a voucher that stopped applying', async () => {
    const { request, variantId } = await buyerWithCart('100', 1)
    const { code, offerId } = await createVoucher(db, variantId, '10')
    const applied = await request('/api/store/cart/vouchers', { method: 'POST', body: { code } })
    await db.update(offers).set({ isActive: false }).where(eq(offers.id, offerId))

    const refused = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: applied.body.total, shippingAddress, guestUser },
    })
    expect(refused.status).toBe(409)
    expect(refused.body.data).toMatchObject({
      code: 'VoucherNoLongerValidError',
      offerId,
      voucherCode: code,
    })
  })

  test('maps bad requests to 400, 404 and 422', async () => {
    const { request } = await buyerWithCart()
    const valid = { expectedTotal: '80', shippingAddress, guestUser }

    for (const body of [
      { ...valid, expectedTotal: 'eighty' },
      { ...valid, guestUser: { name: 'Ann', email: 'not-an-email' } },
      { ...valid, shippingAddress: { line1: '1 Main St' } },
    ]) {
      expect((await request('/api/store/checkout', { method: 'POST', body })).status).toBe(400)
    }
    expect((await request('/api/store/cart?shippingMethodId=999999999')).status).toBe(404)
    expect(
      (await request('/api/store/checkout', { method: 'POST', body: { ...valid, shippingMethodId: 999999999 } })).status,
    ).toBe(404)
    // No cart
    expect((await buyer()('/api/store/checkout', { method: 'POST', body: valid })).status).toBe(404)

    // Empty cart
    const lineId = (await request('/api/store/cart')).body.lines[0].id
    await request(`/api/store/cart/lines/${lineId}`, { method: 'DELETE' })
    const empty = await request('/api/store/checkout', { method: 'POST', body: valid })
    expect(empty.status).toBe(422)
    expect(empty.body.message).toBe('Cannot create an order without lines')
  })
})
