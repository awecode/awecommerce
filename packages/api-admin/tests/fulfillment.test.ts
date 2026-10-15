import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { orderLines, orderLogs, orders } from '@awecommerce/service/apps/order/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { client, createSignedInUser, mailsTo, setupAdminApi, unique, url } from './helpers'

// Digital goods in the backoffice, and the test fulfilment hooks in
// api-core/tests/fulfillment-hooks
describe.skipIf(!url)('digital goods and fulfilment hooks', async () => {
  const db = await setupAdminApi({ rootDir: 'fulfillment-app' })
  const admin = client((await createSignedInUser(db, 'admin')).token)

  // A product of a class with this slug, made through the API the first time
  const product = async (classSlug: string, requiresShipping = false) => {
    const productClass =
      (await admin(`/api/admin/product-classes?q=${classSlug}`)).body.results.find((c: any) => c.slug === classSlug) ??
      (await admin('/api/admin/product-classes', { method: 'POST', body: { name: classSlug, slug: classSlug, requiresShipping } })).body
    expect(productClass.requiresShipping).toBe(requiresShipping)
    const slug = unique('item')
    return await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 10, productClassId: productClass.id })
  }
  // An order with a line of each product, for a guest
  const createOrder = async (email: string, ...items: Awaited<ReturnType<typeof product>>[]) => {
    const [order] = await db.insert(orders).values({ total: '10', guestUser: { name: 'Guest', email } }).returning()
    await db.insert(orderLines).values(
      await Promise.all(
        items.map(async (item) => ({
          orderId: order!.id,
          productId: item.id,
          variantId: item.variants[0]!.id,
          productName: item.name,
          sku: item.variants[0]!.sku,
          price: '10',
          quantity: 1,
          requiresShipping: (await admin(`/api/admin/product-classes/${item.productClassId}`)).body.requiresShipping,
        })),
      ),
    )
    return order!
  }
  const logs = async (orderId: number) =>
    (await db.select().from(orderLogs).where(eq(orderLogs.orderId, orderId))).map((log) => log.log)
  const setPayment = (id: number, paymentStatus: string) =>
    admin(`/api/admin/orders/${id}/payment-status`, { method: 'POST', body: { paymentStatus } })

  test('marking an order paid runs the paid hooks once', async () => {
    const ebook = await product('test-e-book')
    const order = await createOrder(`${unique('ann')}@example.com`, ebook)

    expect((await setPayment(order.id, 'Pending')).status).toBe(200)
    expect((await setPayment(order.id, 'Paid')).status).toBe(200)
    // Already paid: no second run
    expect((await setPayment(order.id, 'Paid')).status).toBe(200)
    expect((await logs(order.id)).filter((log) => log.startsWith('e-books paid'))).toEqual([`e-books paid: ${ebook.variants[0]!.sku}`])
  })

  test('cancelling runs the cancelled hooks', async () => {
    const ebook = await product('test-e-book')
    const order = await createOrder(`${unique('bo')}@example.com`, ebook)
    expect((await admin(`/api/admin/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Duplicate' } })).status).toBe(200)
    expect(await logs(order.id)).toContain(`e-books cancelled: ${ebook.variants[0]!.sku}`)
  })

  test('an order with nothing to ship never gets the shipped email; one with something does', async () => {
    const download = await product('test-plain-download')
    const email = `${unique('cy')}@example.com`
    const digitalOrder = await createOrder(email, download)
    expect((await admin(`/api/admin/orders/${digitalOrder.id}/status`, { method: 'POST', body: { status: 'Shipped' } })).status).toBe(200)
    expect(mailsTo(email)).toEqual([])

    const mug = await product('test-shipped', true)
    const mixedOrder = await createOrder(email, download, mug)
    await admin(`/api/admin/orders/${mixedOrder.id}/status`, { method: 'POST', body: { status: 'Shipped' } })
    expect(mailsTo(email)).toHaveLength(1)
  })
})
