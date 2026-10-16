import { describe, expect, test } from 'vitest'
import { buyer, createProduct, setupApi, url } from './helpers'

// No payment method listed in NUXT_PAYMENT_METHODS: the store takes no orders
describe.skipIf(!url)('payments not set up', async () => {
  process.env.NUXT_PAYMENT_METHODS = ''
  const db = await setupApi()

  test('checkout offers no payment method and places no order', async () => {
    const request = buyer()
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId: await createProduct(db, '10'), quantity: 1 } })
    expect((await request('/api/store/payment-methods')).body).toEqual([])
    const { body: summary } = await request('/api/store/cart')
    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: summary.total, shippingAddress: { line1: '1 Main St', city: 'Pokhara', country: 'Nepal' }, guestUser: { name: 'Ann', email: 'ann@example.com' } },
    })
    expect(placed.status).toBe(422)
    expect(placed.body.message).toBe('Payments are not set up yet')
  })
})
