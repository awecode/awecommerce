import { createPage } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { productVariants, products } from '@awecommerce/service/apps/product/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { createVoucher } from '../../../packages/api-store/tests/helpers'
import { setupStorefront, url } from './helpers'

describe.skipIf(!url)('cart', async () => {
  const db = await setupStorefront()
  // Totals below are checked as US dollars
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`

  const product = async (price = '20', stockQuantity = 10) => {
    const slug = unique('mug')
    return await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity, status: 'Published' })
  }

  // A page whose cart holds the given variants, added the way the shop does
  const pageWithCart = async (lines: { variantId: number; quantity: number }[]) => {
    const page = await createPage('/')
    for (const line of lines) {
      await page.evaluate(async (body) => {
        await fetch('/api/store/cart/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      }, line)
    }
    await page.goto(`${process.env.BETTER_AUTH_URL}/cart`)
    return page
  }

  test('adding on the product page opens the drawer, which leads to the cart', async () => {
    const mug = await product('20')
    const page = await createPage(`/products/${mug.slug}`)
    await page.getByRole('button', { name: 'Add to cart' }).click()

    const drawer = page.getByRole('dialog', { name: 'Your cart (1)' })
    await drawer.getByRole('link', { name: mug.name }).waitFor()
    await drawer.getByText('$20.00').first().waitFor()
    expect(await drawer.getByRole('link', { name: 'Checkout' }).getAttribute('href')).toBe('/checkout')
    await drawer.getByRole('link', { name: 'View cart' }).click()
    await page.waitForURL('**/cart')
    await page.getByRole('heading', { level: 1, name: 'Your cart' }).waitFor()

    // The header's cart button opens it too
    await page.getByRole('button', { name: 'Cart, 1 item' }).click()
    await page.getByRole('dialog', { name: 'Your cart (1)' }).waitFor()
  })

  test('changes quantities and removes lines', async () => {
    const mug = await product('20')
    const bowl = await product('15')
    const page = await pageWithCart([{ variantId: mug.variants[0]!.id, quantity: 1 }, { variantId: bowl.variants[0]!.id, quantity: 1 }])
    await page.getByTestId('cart-total').getByText('$35.00').waitFor()

    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).fill('3')
    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).press('Enter')
    await page.getByTestId('cart-total').getByText('$75.00').waitFor()

    await page.getByRole('button', { name: `Remove ${mug.name}` }).click()
    await page.getByTestId('cart-total').getByText('$15.00').waitFor()
    await page.getByRole('button', { name: `Remove ${bowl.name}` }).click()
    await page.getByText('Your cart is empty.').waitFor()
  })

  test('warns about items out of stock or no longer for sale, and blocks checkout until fixed', async () => {
    const mug = await product('20', 5)
    const bowl = await product('15')
    const page = await pageWithCart([{ variantId: mug.variants[0]!.id, quantity: 4 }, { variantId: bowl.variants[0]!.id, quantity: 1 }])
    await db.update(productVariants).set({ stockQuantity: 2 }).where(eq(productVariants.id, mug.variants[0]!.id))
    await db.update(products).set({ status: 'Draft' }).where(eq(products.id, bowl.id))
    await page.reload()

    await page.getByText('Only 2 left. Lower the quantity to check out.').waitFor()
    await page.getByText('No longer for sale. Remove it to check out.').waitFor()
    await page.getByText('Fix the items marked above to check out.').waitFor()
    const checkout = page.getByRole('complementary', { name: 'Order summary' }).getByRole('link', { name: 'Checkout' })
    expect(await checkout.getAttribute('aria-disabled')).toBe('true')

    // Raising it further is refused
    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).fill('6')
    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).press('Enter')
    await page.getByText('Only 2 left of').first().waitFor()

    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).fill('2')
    await page.getByRole('spinbutton', { name: `Quantity of ${mug.name}` }).press('Enter')
    await page.getByRole('button', { name: `Remove ${bowl.name}` }).click()
    await expect.poll(() => page.getByText('Fix the items marked above').count()).toBe(0)
    expect(await checkout.getAttribute('aria-disabled')).toBeNull()
  })

  test('applies and removes a voucher', async () => {
    const mug = await product('40')
    const { code } = await createVoucher(db as never, mug.variants[0]!.id, '25')
    const page = await pageWithCart([{ variantId: mug.variants[0]!.id, quantity: 1 }])

    await page.getByLabel('Voucher code').fill('NOT-A-CODE')
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByText('Invalid voucher code').waitFor()

    await page.getByLabel('Voucher code').fill(code)
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByText(`Voucher ${code}`).waitFor()
    await page.getByTestId('cart-total').getByText('$30.00').waitFor()
    // The page rendered on the server agrees
    await page.reload()
    await page.getByTestId('cart-total').getByText('$30.00').waitFor()

    await page.getByRole('button', { name: `Remove voucher ${code}` }).click()
    await page.getByTestId('cart-total').getByText('$40.00').waitFor()
  })
})
