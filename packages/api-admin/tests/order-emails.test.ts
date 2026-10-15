import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { orders } from '@awecommerce/service/apps/order/schemas'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { client, createSignedInUser, mailsTo, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('order shipped and cancelled emails', async () => {
  const db = await setupAdminApi()
  const admin = client((await createSignedInUser(db, 'admin')).token)

  const createOrder = async (customer: { guestEmail?: string; userId?: string }) => {
    const [order] = await db
      .insert(orders)
      .values({
        total: '25',
        userId: customer.userId,
        guestUser: customer.guestEmail ? { name: 'Guest', email: customer.guestEmail } : null,
      })
      .returning()
    return order!
  }
  const setStatus = (id: number, status: string) => admin(`/api/admin/orders/${id}/status`, { method: 'POST', body: { status } })
  // The storefront link with the checkout hash, as the storefront checks it
  const orderLink = (id: number) =>
    `http://storefront.test/orders/${id}?hash=${encodeURIComponent(new OrderService(db).generateHash(String(id)))}`

  test('moving an order to Shipped emails the customer once, with the storefront link', async () => {
    const email = `${unique('ann')}@example.com`
    const order = await createOrder({ guestEmail: email })

    expect((await setStatus(order.id, 'Confirmed')).status).toBe(200)
    expect(mailsTo(email)).toEqual([])
    expect((await setStatus(order.id, 'Shipped')).status).toBe(200)
    // Already Shipped: refused, and nothing more is sent
    expect((await setStatus(order.id, 'Shipped')).status).toBe(422)
    expect((await setStatus(order.id, 'Delivered')).status).toBe(200)
    const paid = await admin(`/api/admin/orders/${order.id}/payment-status`, { method: 'POST', body: { paymentStatus: 'Paid' } })
    expect(paid.status).toBe(200)

    const mails = mailsTo(email)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.subject).toMatch(new RegExp(`order #${order.id} has shipped$`))
    expect(mails[0]!.text).toContain(orderLink(order.id))
    expect(mails[0]!.html).toContain(orderLink(order.id))
  })

  test('a member gets it at their account email', async () => {
    const email = `${unique('dee')}@example.com`
    const { userId } = await createSignedInUser(db, null, email)
    const order = await createOrder({ userId })

    await setStatus(order.id, 'Shipped')
    expect(mailsTo(email)).toHaveLength(1)
  })

  test('cancelling emails the reason, not the remarks', async () => {
    const email = `${unique('cy')}@example.com`
    const order = await createOrder({ guestEmail: email })

    const cancelled = await admin(`/api/admin/orders/${order.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Out of stock', remarks: 'Supplier let us down again' },
    })
    expect(cancelled.status).toBe(200)

    const mails = mailsTo(email)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.subject).toMatch(new RegExp(`order #${order.id} was cancelled$`))
    for (const body of [mails[0]!.text, mails[0]!.html]) {
      expect(body).toContain('Reason: Out of stock')
      expect(body).not.toContain('Supplier let us down')
      expect(body).toContain(orderLink(order.id))
    }
  })

  test('when sending fails, the status change and the cancellation stick', async () => {
    const email = `${unique('ses-fail')}@example.com`
    const shipped = await createOrder({ guestEmail: email })
    const response = await setStatus(shipped.id, 'Shipped')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('Shipped')

    const cancelled = await createOrder({ guestEmail: email })
    expect((await admin(`/api/admin/orders/${cancelled.id}/cancel`, { method: 'POST', body: { reason: 'Duplicate' } })).status).toBe(200)

    const rows = await db.select().from(orders).where(eq(orders.guestUser, { name: 'Guest', email }))
    expect(rows.map((row) => row.status).sort()).toEqual(['Cancelled', 'Shipped'])
    expect(mailsTo(email)).toEqual([])
  })

  test('an order without an email address is changed and nothing is sent', async () => {
    const order = await createOrder({})
    const response = await setStatus(order.id, 'Shipped')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('Shipped')
  })
})
