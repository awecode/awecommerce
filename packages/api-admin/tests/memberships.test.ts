import { describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { client, createSignedInUser, setupAdminApi, unique, url } from './helpers'

// The membership hook (api-core/server/plugins/membership.ts) on payment and
// cancellation
describe.skipIf(!url)('memberships bought as products', async () => {
  const db = await setupAdminApi()
  const admin = client((await createSignedInUser(db, 'admin')).token)
  const memberships = new MembershipService(db)

  // An order by a signed-in buyer for a 6-month Platinum term
  const orderMembership = async () => {
    const platinum = await memberships.createPlan({ name: 'Platinum', slug: unique('platinum'), program: unique('music'), rank: 1 })
    const slug = unique('platinum-6')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '40', stockQuantity: 10, status: 'Published' })
    await memberships.addTerm({ planId: platinum.id, variantId: product.variants[0]!.id, months: 6 })
    const { userId } = await createSignedInUser(db, null)
    const cart = await new CartService(db).create(userId)
    await new CartService(db).addToCart(cart.id, product.variants[0]!.id, 1)
    const order = await new OrderService(db).createFromCart(cart.id)
    return { order, userId, platinum }
  }
  const setPayment = (id: number, paymentStatus: string) =>
    admin(`/api/admin/orders/${id}/payment-status`, { method: 'POST', body: { paymentStatus } })

  test('paying grants the membership once, for its months; refunding ends it', async () => {
    const { order, userId, platinum } = await orderMembership()
    expect(await memberships.activeMemberships(userId)).toEqual([])

    expect((await setPayment(order.id, 'Paid')).status).toBe(200)
    await setPayment(order.id, 'Pending')
    await setPayment(order.id, 'Paid')
    const granted = await memberships.forOrder(order.id)
    expect(granted).toHaveLength(1)
    expect(granted[0]).toMatchObject({ userId, planId: platinum.id, months: 6, status: 'active' })
    expect(Number(granted[0]!.pricePaid)).toBe(40)
    expect((await memberships.activeMemberships(userId)).map((m) => m.planId)).toEqual([platinum.id])

    await setPayment(order.id, 'Refunded')
    expect(await memberships.activeMemberships(userId)).toEqual([])
    expect((await memberships.forOrder(order.id))[0]).toMatchObject({ status: 'cancelled', cancellationReason: 'Order refunded' })
  })

  test('cancelling the order ends the membership', async () => {
    const { order, userId } = await orderMembership()
    await setPayment(order.id, 'Paid')
    expect(await memberships.activeMemberships(userId)).toHaveLength(1)

    expect((await admin(`/api/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Changed their mind' } })).status).toBe(200)
    expect(await memberships.activeMemberships(userId)).toEqual([])
    expect((await memberships.forOrder(order.id))[0]).toMatchObject({ status: 'cancelled', cancellationReason: 'Order cancelled' })
  })
})
