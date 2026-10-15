import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { loyaltyPoints } from '@awecommerce/service/apps/loyalty/schemas'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { orders } from '@awecommerce/service/apps/order/schemas'
import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'
import { users } from '../../auth/server/db/schema'
import { client, createSignedInUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('customers and staff API', async () => {
  const db = await setupAdminApi()
  const admin = client((await createSignedInUser(db, 'admin')).token)
  const post = (path: string, body: unknown) => admin(path, { method: 'POST', body })

  test('adds staff by email: makes an existing account staff, or creates one', async () => {
    const email = `${unique('cy')}@example.com`
    const customer = await createSignedInUser(db, 'user', email)
    const promoted = await post('/api/admin/users', { email: email.toUpperCase() })
    expect(promoted.body).toMatchObject({ created: false, user: { id: customer.userId, role: 'admin' } })

    const newEmail = `${unique('new-staff')}@example.com`
    const created = await post('/api/admin/users', { email: newEmail, name: 'New Staff' })
    expect(created.body).toMatchObject({ created: true, user: { email: newEmail, name: 'New Staff', role: 'admin' } })
    const named = await post('/api/admin/users', { email: `${unique('pat')}@example.com` })
    expect(named.body.user.name).toMatch(/^pat-/)
    expect((await post('/api/admin/users', { email: 'not an email' })).status).toBe(400)
  })

  test('changes a name, and needs a name or a role', async () => {
    const { userId } = await createSignedInUser(db, 'user')
    const renamed = await admin(`/api/admin/users/${userId}`, { method: 'PATCH', body: { name: 'Dee Corrected' } })
    expect(renamed.status).toBe(200)
    expect((await db.select().from(users).where(eq(users.id, userId)))[0]!.name).toBe('Dee Corrected')
    expect((await admin(`/api/admin/users/${userId}`, { method: 'PATCH', body: {} })).status).toBe(400)
  })

  test('lists banned users', async () => {
    const email = `${unique('banned')}@example.com`
    const { userId } = await createSignedInUser(db, 'user', email)
    expect((await admin(`/api/admin/users?q=${email}&banned=true`)).body.results).toEqual([])
    await post(`/api/admin/users/${userId}/ban`, { reason: 'Spam' })
    expect((await admin(`/api/admin/users?q=${email}&banned=true`)).body.results.map((u: any) => u.id)).toEqual([userId])
  })

  test('shows a person with their orders, memberships, addresses and points', async () => {
    const email = `${unique('dee')}@example.com`
    const { userId } = await createSignedInUser(db, 'user', email)
    for (const total of ['10', '20']) {
      await db.insert(orders).values({ total, userId })
    }
    await new ShippingAddressService(db).create({ userId, line1: '1 Lake Rd', city: 'Pokhara', country: 'Nepal' })
    const plan = await new MembershipService(db).createPlan({ name: 'Gold', slug: unique('gold'), program: unique('music'), rank: 1 })
    await new MembershipService(db).grant({ userId, planId: plan.id, months: 1 })
    await db.insert(loyaltyPoints).values({ userId, orderId: 0, earnedPoints: '25' })

    const { status, body } = await admin(`/api/admin/users/${userId}`)
    expect(status).toBe(200)
    expect(body.user).toMatchObject({ id: userId, email, role: 'user', banned: false })
    expect(body.orders.total).toBe(2)
    expect(body.orders.results[0]).toMatchObject({ items: 0, status: 'Pending' })
    expect(body.memberships).toEqual([expect.objectContaining({ state: 'active', plan: expect.objectContaining({ name: 'Gold' }) })])
    expect(body.addresses).toEqual([expect.objectContaining({ line1: '1 Lake Rd' })])
    expect(Number(body.loyalty.points)).toBe(25)
    expect((await admin('/api/admin/users/no-such-user')).status).toBe(404)
  })
})
