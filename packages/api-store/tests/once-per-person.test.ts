import { describe, expect, test } from 'vitest'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductClassService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { buyer, createUser, setupApi, unique, url } from './helpers'

// Once per person products (an ebook) in the store: one in the cart, and the
// product page says which order the buyer owns it from
describe.skipIf(!url)('once per person products', async () => {
  const db = await setupApi()

  test('one in the cart, then owned once paid', async () => {
    const ebooks = await new ProductClassService(db).create({ name: unique('Ebook'), slug: unique('ebook'), requiresShipping: false, oncePerPerson: true })
    const slug = unique('ebook')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 10, status: 'Published', productClassId: ebooks.id })
    const variantId = product.variants[0]!.id
    const reader = buyer()
    reader.signIn((await createUser(db)).token)

    const twice = await reader('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 2 } })
    expect(twice.status).toBe(422)
    expect(twice.body.message).toBe(`Only one ${slug} can be bought`)
    const cart = await reader('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })
    expect(cart.body.requiresAccount).toBe(true)
    expect(cart.body.lines[0]).toMatchObject({ oncePerPerson: true, ownedInOrder: null })
    expect((await reader(`/api/store/products/${slug}`)).body.variants[0]).toMatchObject({ oncePerPerson: true, ownedInOrder: null })

    const placed = await reader('/api/store/checkout', { method: 'POST', body: { expectedTotal: cart.body.total } })
    expect(placed.status).toBe(200)
    await new OrderService(db).changePaymentStatus(placed.body.id, 'Paid')
    expect((await reader(`/api/store/products/${slug}`)).body.variants[0]).toMatchObject({ ownedInOrder: placed.body.id })
    const again = await reader('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity: 1 } })
    expect(again.status).toBe(422)
    expect(again.body.message).toBe(`You already own ${slug}`)
  })
})
