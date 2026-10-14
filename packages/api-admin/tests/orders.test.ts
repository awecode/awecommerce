import { describe, expect, test } from 'vitest'
import { orders } from '@awecommerce/service/apps/order/schemas'
import { client, createSignedInUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('admin orders and users API', async () => {
  const db = await setupAdminApi()
  const staff = await createSignedInUser(db, 'admin')
  const admin = client(staff.token)

  const createOrder = async (guestEmail?: string) => {
    const [order] = await db
      .insert(orders)
      .values({ total: '25', guestUser: guestEmail ? { name: 'Guest', email: guestEmail } : null })
      .returning()
    return order!
  }

  test('lists orders, finds them by guest email and filters by status', async () => {
    const email = `${unique('ann')}@example.com`
    const order = await createOrder(email)
    await createOrder()

    const found = (await admin(`/api/admin/orders?q=${email}`)).body
    expect(found.results.map((o: any) => o.id)).toEqual([order.id])
    expect(found.pagination.total).toBe(1)
    const pending = (await admin(`/api/admin/orders?q=${email}&status=Pending&paymentStatus=Pending`)).body
    expect(pending.results).toHaveLength(1)
    expect((await admin(`/api/admin/orders?q=${email}&tab=Completed`)).body.results).toEqual([])
  })

  test('moves an order through statuses, records payment, then cancels it, logging who did each', async () => {
    const order = await createOrder(`${unique('flow')}@example.com`)

    const confirmed = await admin(`/api/admin/orders/${order.id}/status`, { method: 'POST', body: { status: 'Confirmed' } })
    expect(confirmed.body.status).toBe('Confirmed')
    expect((await admin(`/api/admin/orders/${order.id}/status`, { method: 'POST', body: { status: 'Confirmed' } })).status).toBe(422)
    const paid = await admin(`/api/admin/orders/${order.id}/payment-status`, { method: 'POST', body: { paymentStatus: 'Paid' } })
    expect(paid.body.paymentStatus).toBe('Paid')
    const cancelled = await admin(`/api/admin/orders/${order.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Out of stock', remarks: 'Called the buyer' },
    })
    expect(cancelled.body).toMatchObject({
      status: 'Cancelled',
      cancelledBy: staff.userId,
      cancellationReason: 'Out of stock',
    })

    const detail = (await admin(`/api/admin/orders/${order.id}`)).body
    expect(detail.logs.map((l: any) => l.loggedBy)).toEqual([staff.userId, staff.userId, staff.userId])
    expect(detail.logs[1].log).toBe('Payment Paid')
    expect((await admin(`/api/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'again' } })).status).toBe(422)
    expect((await admin(`/api/admin/orders/${order.id}/status`, { method: 'POST', body: { status: 'Shipped' } })).status).toBe(422)
  })

  test('refuses Cancelled as a status, and gives 404 and 400 where due', async () => {
    const order = await createOrder()
    expect((await admin(`/api/admin/orders/${order.id}/status`, { method: 'POST', body: { status: 'Cancelled' } })).status).toBe(400)
    expect((await admin(`/api/admin/orders/${order.id}/cancel`, { method: 'POST', body: {} })).status).toBe(400)
    expect((await admin('/api/admin/orders/999999999')).status).toBe(404)
    expect((await admin('/api/admin/orders/999999999/status', { method: 'POST', body: { status: 'Shipped' } })).status).toBe(404)
    expect((await admin('/api/admin/orders/999999999/payment-status', { method: 'POST', body: { paymentStatus: 'Paid' } })).status).toBe(404)
  })

  test('finds users, makes one staff and back, and keeps the admin from demoting themselves', async () => {
    const email = `${unique('customer')}@example.com`
    const customer = await createSignedInUser(db, 'user', email)

    const found = (await admin(`/api/admin/users?q=${email}`)).body
    expect(found.results.map((u: any) => u.id)).toEqual([customer.userId])
    expect(found.pagination.total).toBe(1)

    const promoted = await admin(`/api/admin/users/${customer.userId}`, { method: 'PATCH', body: { role: 'admin' } })
    expect(promoted.body.role).toBe('admin')
    expect((await client(customer.token)('/api/admin/orders')).status).toBe(200)
    expect((await admin(`/api/admin/users?q=${email}&role=admin`)).body.results).toHaveLength(1)
    await admin(`/api/admin/users/${customer.userId}`, { method: 'PATCH', body: { role: 'user' } })
    expect((await client(customer.token)('/api/admin/orders')).status).toBe(403)

    const selfDemote = await admin(`/api/admin/users/${staff.userId}`, { method: 'PATCH', body: { role: 'user' } })
    expect(selfDemote.status).toBe(422)
    expect((await admin('/api/admin/users/no-such-user', { method: 'PATCH', body: { role: 'admin' } })).status).toBe(404)
  })

  test('bans a user, which signs them out, and unbans them', async () => {
    const user = await createSignedInUser(db, 'admin')
    expect((await client(user.token)('/api/admin/orders')).status).toBe(200)

    const banned = await admin(`/api/admin/users/${user.userId}/ban`, { method: 'POST', body: { reason: 'Spam', days: 7 } })
    expect(banned.body).toMatchObject({ banned: true, banReason: 'Spam' })
    expect((await client(user.token)('/api/admin/orders')).status).toBe(401)

    const unbanned = await admin(`/api/admin/users/${user.userId}/unban`, { method: 'POST' })
    expect(unbanned.body.banned).toBe(false)
    expect((await admin(`/api/admin/users/${staff.userId}/ban`, { method: 'POST', body: {} })).status).toBe(400)
  })
})
