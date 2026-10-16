import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { orderLogs, orders, productClasses } from '@awecommerce/service/core/db/pg/schema'
import { buyer, createProduct, mailsTo, setupApi, unique, url } from './helpers'

const shippingAddress = { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' }

// Digital goods (a product class that is not shipped) and the test fulfilment
// hooks in api-core/tests/fulfillment-hooks
describe.skipIf(!url)('digital goods and fulfilment hooks', async () => {
  const db = await setupApi({ rootDir: 'fulfillment-app' })

  // A class by slug; the hooks match the test-e-book and test-broken classes
  const productClass = async (slug: string, requiresShipping = false) => {
    await db.insert(productClasses).values({ name: slug, slug, requiresShipping }).onConflictDoNothing()
    return (await db.select().from(productClasses).where(eq(productClasses.slug, slug)))[0]!
  }
  // Returns the new product's variant id
  const digitalProduct = async (classSlug: string, price = '10') => {
    const slug = unique('download')
    const product = await new ProductService(db).create({
      name: slug,
      slug,
      sku: slug,
      price,
      stockQuantity: 1000,
      status: 'Published',
      productClassId: (await productClass(classSlug)).id,
    })
    return product.variants[0]!.id
  }
  const guest = () => ({ name: 'Ann', email: `${unique('ann')}@example.com` })
  const withCart = async (...variantIds: number[]) => {
    const request = buyer()
    for (const variantId of variantIds) {
      await request('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })
    }
    return request
  }
  const checkout = async (request: ReturnType<typeof buyer>, body: Record<string, unknown>) =>
    await request('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: (await request('/api/store/cart')).body.total, guestUser: guest(), ...body },
    })
  const logs = async (orderId: number) =>
    (await db.select().from(orderLogs).where(eq(orderLogs.orderId, orderId))).map((log) => log.log)

  test('a cart with nothing to ship takes no address or shipping, and pays later', async () => {
    const request = await withCart(await digitalProduct('test-plain-download'))
    const cart = await request('/api/store/cart')
    expect(cart.body.requiresShipping).toBe(false)
    const method = await new ShippingMethodService(db).create({ name: unique('ship'), price: '5' })
    expect((await request(`/api/store/cart?shippingMethodId=${method.id}`)).status).toBe(422)

    expect((await checkout(request, { paymentMethod: 'cash_on_delivery' })).status).toBe(422)
    expect((await checkout(request, { shippingMethodId: method.id })).status).toBe(422)
    // An address given anyway is not kept
    const placed = await checkout(request, { shippingAddress })
    expect(placed.status).toBe(200)
    expect(placed.body.paymentMethod).toBe('pay_later')
    expect(placed.body.shippingAddress).toEqual({})
    expect(placed.body.lines[0].requiresShipping).toBe(false)
  })

  test('a cart with something to ship needs an address and pays on delivery', async () => {
    const request = await withCart(await digitalProduct('test-plain-download'), await createProduct(db, '20'))
    expect((await request('/api/store/cart')).body.requiresShipping).toBe(true)

    const noAddress = await checkout(request, {})
    expect(noAddress.status).toBe(422)
    expect(noAddress.body.message).toBe('Pass shippingAddress or shippingAddressId: the cart has something to ship')
    expect((await checkout(request, { shippingAddress, paymentMethod: 'pay_later' })).status).toBe(422)
    const placed = await checkout(request, { shippingAddress })
    expect(placed.status).toBe(200)
    expect(placed.body.paymentMethod).toBe('cash_on_delivery')
    expect(placed.body.lines.map((line: any) => line.requiresShipping).sort()).toEqual([false, true])
  })

  test('runs the placed hooks for their lines, and shows the notes on the order and in the email', async () => {
    const ebook = await digitalProduct('test-e-book')
    const plain = await digitalProduct('test-plain-download')
    const shipped = await createProduct(db, '20')
    const request = await withCart(ebook, plain, shipped)
    const buyerDetails = guest()
    const placed = await checkout(request, { shippingAddress, guestUser: buyerDetails })
    expect(placed.status).toBe(200)
    const { id, hash, lines } = placed.body
    const sku = (variantId: number) => lines.find((line: any) => line.variantId === variantId).sku

    expect(await logs(id)).toContain(`e-books placed: ${sku(ebook)}`)

    const shown = await request(`/api/store/orders/${id}?hash=${encodeURIComponent(hash)}`)
    const note = (variantId: number) => shown.body.lines.find((line: any) => line.variantId === variantId).note
    expect(note(ebook)).toEqual({ title: 'Download after payment', text: 'The link appears here once you have paid.' })
    // Not shipped and no hook: the generic note; shipped: none
    expect(note(plain).title).toBe('Your purchase is confirmed')
    expect(note(shipped)).toBeNull()

    const [mail] = mailsTo(buyerDetails.email)
    expect(mail!.text).toContain('  Download after payment: The link appears here once you have paid.')
    expect(mail!.text).toContain('  Your purchase is confirmed: ')
    expect(mail!.html).toContain('Download after payment')

    // The note follows the order: paid, it has the link
    await db.update(orders).set({ paymentStatus: 'Paid' }).where(eq(orders.id, id))
    const paid = await request(`/api/store/orders/${id}?hash=${encodeURIComponent(hash)}`)
    expect(paid.body.lines.find((line: any) => line.variantId === ebook).note).toEqual({
      title: 'Ready to download',
      text: 'Your e-book is ready.',
      link: { label: 'Download', url: 'https://files.test/e-book' },
    })
  })

  test('a failing hook or note does not stop the order, the email or the other hooks', async () => {
    const broken = await digitalProduct('test-broken')
    const ebook = await digitalProduct('test-e-book')
    const request = await withCart(broken, ebook)
    const buyerDetails = guest()
    const placed = await checkout(request, { guestUser: buyerDetails })
    expect(placed.status).toBe(200)
    expect((await logs(placed.body.id)).some((log) => log.startsWith('e-books placed:'))).toBe(true)
    expect(mailsTo(buyerDetails.email)).toHaveLength(1)

    const shown = await request(`/api/store/orders/${placed.body.id}?hash=${encodeURIComponent(placed.body.hash)}`)
    const note = (variantId: number) => shown.body.lines.find((line: any) => line.variantId === variantId).note
    // The broken note is left out, so the line has the generic one
    expect(note(broken).title).toBe('Your purchase is confirmed')
    expect(note(ebook).title).toBe('Download after payment')
  })
})
