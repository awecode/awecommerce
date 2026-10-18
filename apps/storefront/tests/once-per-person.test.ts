import { describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductClassService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { setupStorefront, signedInPage, url } from './helpers'

// An ebook (a once per person class): no quantity, and once paid the product
// page links to the order instead of Add to cart
describe.skipIf(!url)('once per person products', async () => {
  const db = await setupStorefront()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`

  test('no quantity to pick, and "You own this" once bought', async () => {
    const ebooks = await new ProductClassService(db).create({ name: unique('Ebook'), slug: unique('ebook'), requiresShipping: false, oncePerPerson: true })
    const slug = unique('ebook')
    const ebook = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 10, status: 'Published', productClassId: ebooks.id })

    const page = await signedInPage(db, `${unique('reader')}@example.com`)
    await page.goto(`${process.env.BETTER_AUTH_URL}/products/${slug}`)
    await page.getByRole('button', { name: 'Add to cart' }).waitFor()
    expect(await page.getByRole('spinbutton', { name: 'Quantity' }).count()).toBe(0)
    await page.getByRole('button', { name: 'Add to cart' }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByText(slug).first().waitFor()
    expect(await drawer.getByRole('spinbutton').count()).toBe(0)

    // Bought and paid
    const userId = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    const cart = await new CartService(db).create(userId)
    await new CartService(db).addToCart(cart.id, ebook.variants[0]!.id, 1)
    const order = await new OrderService(db).createFromCart(cart.id)
    await new OrderService(db).changePaymentStatus(order.id, 'Paid')

    await page.goto(`${process.env.BETTER_AUTH_URL}/products/${slug}`)
    const owned = page.getByTestId('owned')
    await owned.getByText('You own this').waitFor()
    expect(await owned.getByRole('link', { name: 'View your order' }).getAttribute('href')).toBe(`/orders/${order.id}`)
    expect(await page.getByRole('button', { name: 'Add to cart' }).count()).toBe(0)
  })
})
