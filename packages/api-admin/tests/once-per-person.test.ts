import { describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductClassService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { client, createSignedInUser, setupAdminApi, unique, url } from './helpers'

// The once per person hook (api-core/server/plugins/oncePerPerson.ts): paying
// an order with an ebook cancels the buyer's other pending, unpaid orders for it
describe.skipIf(!url)('once per person products', async () => {
  const db = await setupAdminApi()
  const admin = client((await createSignedInUser(db, 'admin')).token)
  const orders = new OrderService(db)

  test('paying one order cancels the abandoned ones with the same variant', async () => {
    const ebooks = await new ProductClassService(db).create({ name: unique('Ebook'), slug: unique('ebook'), requiresShipping: false, oncePerPerson: true })
    const product = async (productClassId?: number) => {
      const slug = unique('item')
      return (await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 10, status: 'Published', productClassId })).variants[0]!.id
    }
    const [ebook, otherEbook, mug] = [await product(ebooks.id), await product(ebooks.id), await product()]
    const { userId } = await createSignedInUser(db, null)
    const order = async (variantIds: number[]) => {
      const cart = await new CartService(db).create(userId)
      for (const variantId of variantIds) await new CartService(db).addToCart(cart.id, variantId, 1)
      return (await orders.createFromCart(cart.id)).id
    }
    const abandoned = await order([ebook, mug])
    const confirmed = await order([ebook])
    const other = await order([otherEbook])
    const paid = await order([ebook])
    expect((await admin(`/api/admin/orders/${confirmed}/status`, { method: 'POST', body: { status: 'Confirmed' } })).status).toBe(200)

    expect((await admin(`/api/admin/orders/${paid}/payment-status`, { method: 'POST', body: { paymentStatus: 'Paid' } })).status).toBe(200)
    expect(await orders.get(abandoned)).toMatchObject({ status: 'Cancelled', cancellationReason: `Bought in order ${paid}` })
    // Confirmed by staff, or another ebook: left alone
    expect((await orders.get(confirmed))!.status).toBe('Confirmed')
    expect((await orders.get(other))!.status).toBe('Pending')
  })
})
