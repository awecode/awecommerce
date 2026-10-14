import { describe, expect, test } from 'vitest'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { loyaltyPoints } from '@awecommerce/service/apps/loyalty/schemas'
import { buyer, createProduct, createUser, setupApi, signInWithMagicLink, unique, url } from './helpers'

const address = { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' }

describe.skipIf(!url)('signed-in store API', async () => {
  const db = await setupApi()

  const addLine = (request: ReturnType<typeof buyer>, variantId: number, quantity: number) =>
    request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity } })

  test('signing in keeps the guest cart and merges it into the account cart', async () => {
    const { userId, token } = await createUser(db)
    const shared = await createProduct(db, '10')
    const guestOnly = await createProduct(db, '20')
    // Added on another device while signed in
    const otherDevice = buyer()
    otherDevice.signIn(token)
    await addLine(otherDevice, shared, 1)
    // Added as a guest on this device
    const request = buyer()
    await addLine(request, shared, 2)
    await addLine(request, guestOnly, 1)

    request.signIn(token)
    const cart = await request('/api/store/cart')

    expect(cart.body.userId).toBe(userId)
    const quantities = Object.fromEntries(cart.body.lines.map((l: any) => [l.variantId, l.quantity]))
    expect(quantities).toEqual({ [shared]: 3, [guestOnly]: 1 })
    // The other device sees the same cart, and it does not merge twice
    expect((await otherDevice('/api/store/cart')).body.id).toBe(cart.body.id)
    expect((await request('/api/store/cart')).body.lines.map((l: any) => l.quantity).sort()).toEqual([1, 3])
  })

  test('after signing out, the browser no longer shows the account cart', async () => {
    const { token } = await createUser(db)
    const variantId = await createProduct(db, '10')
    const request = buyer()
    request.signIn(token)
    await addLine(request, variantId, 1)

    request.signOut()

    expect((await request('/api/store/cart')).status).toBe(204)
    const guestCart = await addLine(request, variantId, 1)
    expect(guestCart.body.userId).toBeNull()
  })

  test('saves, changes and deletes addresses, only for their owner', async () => {
    const owner = buyer()
    owner.signIn((await createUser(db)).token)
    const other = buyer()
    other.signIn((await createUser(db)).token)

    expect((await buyer()('/api/store/addresses')).status).toBe(401)
    const home = await owner('/api/store/addresses', { method: 'POST', body: { ...address, isDefault: true } })
    expect(home.status).toBe(200)
    const work = await owner('/api/store/addresses', {
      method: 'POST',
      body: { ...address, line1: '2 Office Rd', isDefault: true },
    })
    const listed = (await owner('/api/store/addresses')).body
    expect(listed.map((a: any) => [a.id, a.isDefault])).toEqual([
      [work.body.id, true],
      [home.body.id, false],
    ])

    const changed = await owner(`/api/store/addresses/${home.body.id}`, { method: 'PATCH', body: { city: 'Pokhara' } })
    expect(changed.body.city).toBe('Pokhara')
    expect((await other(`/api/store/addresses/${home.body.id}`, { method: 'PATCH', body: { city: 'X' } })).status).toBe(404)
    expect((await other(`/api/store/addresses/${home.body.id}`, { method: 'DELETE' })).status).toBe(404)
    expect((await other('/api/store/addresses')).body).toEqual([])

    expect((await owner(`/api/store/addresses/${home.body.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await owner('/api/store/addresses')).body.map((a: any) => a.id)).toEqual([work.body.id])
  })

  test('a signed-in buyer checks out with a saved address and no guest details', async () => {
    const { userId, token } = await createUser(db)
    const request = buyer()
    request.signIn(token)
    const saved = (await request('/api/store/addresses', { method: 'POST', body: { ...address, postalCode: '44600' } })).body
    await addLine(request, await createProduct(db, '30'), 1)
    const summary = await request('/api/store/cart')

    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: summary.body.total, shippingAddressId: saved.id },
    })

    expect(placed.status).toBe(200)
    expect(placed.body.userId).toBe(userId)
    expect(placed.body.guestUser).toBeNull()
    expect(placed.body.shippingAddress).toEqual({ ...address, postalCode: '44600' })
  })

  test('checkout needs guest details from guests, and only owners can use a saved address', async () => {
    const variantId = await createProduct(db, '30')
    const guest = buyer()
    await addLine(guest, variantId, 1)
    const noDetails = await guest('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: '30', shippingAddress: address },
    })
    expect(noDetails.status).toBe(400)
    expect(noDetails.body.message).toBe('guestUser is required when not signed in')

    const owner = buyer()
    owner.signIn((await createUser(db)).token)
    const saved = (await owner('/api/store/addresses', { method: 'POST', body: address })).body
    const other = buyer()
    other.signIn((await createUser(db)).token)
    await addLine(other, variantId, 1)
    const notTheirs = await other('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: '30', shippingAddressId: saved.id },
    })
    expect(notTheirs.status).toBe(404)
    // Both, or neither
    const both = await other('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: '30', shippingAddress: address, shippingAddressId: saved.id },
    })
    expect(both.status).toBe(400)
  })

  test('lists the buyer orders and shows each without a hash, only to its owner', async () => {
    const owner = buyer()
    owner.signIn((await createUser(db)).token)
    const placeOrder = async () => {
      await addLine(owner, await createProduct(db, '10'), 1)
      const { total } = (await owner('/api/store/cart')).body
      return (await owner('/api/store/checkout', {
        method: 'POST',
        body: { expectedTotal: total, shippingAddress: address },
      })).body
    }
    const first = await placeOrder()
    const second = await placeOrder()

    const page = await owner('/api/store/orders?page=1&size=1')
    expect(page.body.results.map((o: any) => o.id)).toEqual([second.id])
    expect(page.body.pagination).toMatchObject({ total: 2, pages: 2 })
    expect((await owner('/api/store/orders?page=2&size=1')).body.results.map((o: any) => o.id)).toEqual([first.id])

    const shown = await owner(`/api/store/orders/${first.id}`)
    expect(shown.status).toBe(200)
    expect(shown.body.id).toBe(first.id)

    const other = buyer()
    other.signIn((await createUser(db)).token)
    expect((await other('/api/store/orders')).body.results).toEqual([])
    expect((await other(`/api/store/orders/${first.id}`)).status).toBe(404)
    // Signed out: a hash still works, no hash needs sign-in
    expect((await buyer()(`/api/store/orders/${first.id}`)).status).toBe(401)
    expect((await buyer()('/api/store/orders')).status).toBe(401)
    const byHash = await buyer()(`/api/store/orders/${first.id}?hash=${encodeURIComponent(first.hash)}`)
    expect(byHash.body.id).toBe(first.id)
  })

  test('signing in links the orders placed as a guest with the same email', async () => {
    const email = `${unique('ann')}@example.com`
    const guestOrder = async (guestEmail: string) => {
      const guest = buyer()
      await addLine(guest, await createProduct(db, '10'), 1)
      return (await guest('/api/store/checkout', {
        method: 'POST',
        body: { expectedTotal: '10', shippingAddress: address, guestUser: { name: 'Ann', email: guestEmail } },
      })).body
    }
    const first = await guestOrder(email)
    const second = await guestOrder(email.toUpperCase())
    const someoneElse = await guestOrder(`${unique('bob')}@example.com`)

    const request = buyer()
    const signedIn = await signInWithMagicLink(db, request, email)
    expect(signedIn.status).toBe(200)

    const ids = (await request('/api/store/orders')).body.results.map((o: any) => o.id)
    expect(ids.sort()).toEqual([first.id, second.id].sort())
    expect(ids).not.toContain(someoneElse.id)
    expect((await request(`/api/store/orders/${first.id}`)).status).toBe(200)
  })

  test('shows loyalty points, previews their value and redeems them at checkout', async () => {
    await new LoyaltyService(db).updateSettings({ isEnabled: true, redeemRate: '0.5' })
    const { userId, token } = await createUser(db)
    await db.insert(loyaltyPoints).values({ userId, orderId: 0, earnedPoints: '40' })
    const request = buyer()
    request.signIn(token)
    await addLine(request, await createProduct(db, '100'), 1)

    const balance = (await request('/api/store/loyalty')).body
    expect(balance).toMatchObject({ canRedeem: true, points: 40, value: 20 })
    const preview = await request('/api/store/cart?redeemPoints=30')
    expect(Number(preview.body.loyaltyDiscount)).toBe(15)
    expect(Number(preview.body.total)).toBe(85)

    const placed = await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: preview.body.total, shippingAddress: address, redeemPoints: 30 },
    })
    expect(placed.status).toBe(200)
    expect(Number(placed.body.loyaltyDiscount)).toBe(15)
    expect((await request('/api/store/loyalty')).body.points).toBe(10)

    expect((await buyer()('/api/store/loyalty')).status).toBe(401)
    const guest = buyer()
    await addLine(guest, await createProduct(db, '100'), 1)
    expect((await guest('/api/store/cart?redeemPoints=5')).status).toBe(422)
  })
})
