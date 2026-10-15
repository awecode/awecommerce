import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { orders } from '@awecommerce/service/core/db/pg/schema'
import { buyer, createProduct, createUser, mailsTo, setupApi, unique, url } from './helpers'

const shippingAddress = { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' }

describe.skipIf(!url)('order placed email', async () => {
  const db = await setupApi()

  // Checks out one line of a new product, as a guest or signed in
  const checkout = async (request: ReturnType<typeof buyer>, guestUser?: { name: string; email: string }) => {
    const variantId = await createProduct(db, '12.50')
    await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 2 } })
    const { total } = (await request('/api/store/cart')).body
    return await request('/api/store/checkout', { method: 'POST', body: { expectedTotal: total, shippingAddress, guestUser } })
  }

  test('a guest gets one email with the lines, the total and a link that opens the order', async () => {
    const email = `${unique('ann')}@example.com`
    const placed = await checkout(buyer(), { name: 'Ann', email })
    expect(placed.status).toBe(200)

    const mails = mailsTo(email)
    expect(mails).toHaveLength(1)
    const [mail] = mails
    expect(mail!.subject).toMatch(new RegExp(`order #${placed.body.id}$`))
    const link = `http://storefront.test/orders/${placed.body.id}?hash=${encodeURIComponent(placed.body.hash)}`
    expect(mail!.text).toContain(link)
    expect(mail!.html).toContain(link)
    expect(mail!.text).toContain(`${placed.body.lines[0].productName} × 2: $25.00`)
    expect(mail!.text).toContain('Total: $25.00')

    // The link's hash opens the order for someone who is not signed in
    const opened = await buyer()(`/api/store/orders/${placed.body.id}?hash=${encodeURIComponent(placed.body.hash)}`)
    expect(opened.status).toBe(200)
  })

  test('a signed-in buyer gets it at their account email', async () => {
    const { userId, token } = await createUser(db)
    const request = buyer()
    request.signIn(token)
    const placed = await checkout(request)

    expect(placed.status).toBe(200)
    const mails = mailsTo(`${userId}@example.com`)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.text).toContain(`http://storefront.test/orders/${placed.body.id}?hash=`)
  })

  test('when sending fails, the order is still placed', async () => {
    const email = `${unique('ses-fail')}@example.com`
    const placed = await checkout(buyer(), { name: 'Bo', email })

    expect(placed.status).toBe(200)
    expect(mailsTo(email)).toEqual([])
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.body.id))
    expect(order!.status).toBe('Pending')
  })
})
