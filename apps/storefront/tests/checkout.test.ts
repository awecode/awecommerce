import { createPage } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { loyaltyPoints } from '@awecommerce/service/apps/loyalty/schemas'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { orders } from '@awecommerce/service/apps/order/schemas'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { productVariants } from '@awecommerce/service/apps/product/schemas'
import { ProductClassService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { setupStorefront, signedInPage, url } from './helpers'

type Page = Awaited<ReturnType<typeof createPage>>

describe.skipIf(!url)('checkout', async () => {
  const db = await setupStorefront()
  // Totals below are checked as US dollars
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const courier = await new ShippingMethodService(db).create({ name: unique('Courier'), price: '5' })

  const product = async (price = '20', stockQuantity = 10) => {
    const slug = unique('lamp')
    return await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity, status: 'Published' })
  }

  // Adds to the page's cart the way the shop does, then opens checkout
  const checkoutWith = async (page: Page, variantId: number, quantity = 1) => {
    await page.evaluate(async (body) => {
      await fetch('/api/store/cart/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    }, { variantId, quantity })
    await page.goto(`${process.env.BETTER_AUTH_URL}/checkout`)
    await page.getByRole('heading', { level: 1, name: 'Checkout' }).waitFor()
  }

  const fillGuest = async (page: Page, email: string) => {
    await page.getByLabel('Name', { exact: true }).fill('Ann Buyer')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Address', { exact: true }).fill('1 Main St')
    await page.getByLabel('City').fill('Kathmandu')
    await page.getByLabel('Country').fill('Nepal')
  }

  const total = (page: Page) => page.getByTestId('checkout-total')

  test('a guest checks out with shipping and pays on delivery', async () => {
    const lamp = await product('20')
    const page = await createPage('/')
    await checkoutWith(page, lamp.variants[0]!.id, 2)
    const email = `${unique('ann')}@example.com`

    await fillGuest(page, email)
    await page.getByRole('radio', { name: new RegExp(courier.name) }).click()
    await total(page).getByText('$45.00').waitFor()
    await page.getByRole('radio', { name: /Cash on delivery/ }).waitFor()
    await page.getByRole('button', { name: /^Place order/ }).click()

    await page.waitForURL(/\/orders\/\d+\?hash=/)
    await page.getByRole('heading', { level: 1, name: 'Thank you for your order' }).waitFor()
    await page.getByText(email).first().waitFor()
    await page.getByText('Cash on delivery').first().waitFor()
    await page.getByTestId('order-total').getByText('$45.00').waitFor()
    const id = Number(new URL(page.url()).pathname.split('/').pop())
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order).toMatchObject({
      guestUser: { name: 'Ann Buyer', email },
      shippingAddress: { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' },
      paymentMethod: 'cash_on_delivery',
    })
    expect(order!.shippingMethod).toMatchObject({ id: courier.id })
    await page.getByRole('button', { name: 'Cart', exact: true }).waitFor()
  })

  test('a cart with nothing to ship skips the address and delivery, and pays later', async () => {
    const slug = unique('e-book')
    const digital = await new ProductClassService(db).create({ name: slug, slug, requiresShipping: false })
    const ebook = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '12', stockQuantity: 10, status: 'Published', productClassId: digital.id })
    const page = await createPage('/')
    await checkoutWith(page, ebook.variants[0]!.id)
    const email = `${unique('fay')}@example.com`

    await page.getByRole('radio', { name: /Pay later/ }).waitFor()
    expect(await page.getByRole('heading', { name: 'Delivery address' }).count()).toBe(0)
    expect(await page.getByRole('radio', { name: new RegExp(courier.name) }).count()).toBe(0)
    await page.getByLabel('Name', { exact: true }).fill('Fay Reader')
    await page.getByLabel('Email').fill(email)
    await total(page).getByText('$12.00').waitFor()
    await page.getByRole('button', { name: /^Place order/ }).click()

    await page.waitForURL(/\/orders\/\d+\?hash=/)
    await page.getByText('Your purchase is confirmed').waitFor()
    await page.getByText('Pay later').first().waitFor()
    expect(await page.getByRole('heading', { name: 'Delivery address' }).count()).toBe(0)
    const id = Number(new URL(page.url()).pathname.split('/').pop())
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order!.paymentMethod).toBe('pay_later')
    expect(order!.shippingMethod).toEqual({})
  })

  test('says which fields are missing', async () => {
    const lamp = await product()
    const page = await createPage('/')
    await checkoutWith(page, lamp.variants[0]!.id)

    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.getByText('Enter your email').waitFor()
    await page.getByText('Enter the street address').waitFor()
    expect(page.url()).toMatch(/\/checkout$/)

    // Fixed, it goes through
    await fillGuest(page, `${unique('ed')}@example.com`)
    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.waitForURL(/\/orders\/\d+\?hash=/)
  })

  test('when the total changes, shows the new one before placing the order', async () => {
    const lamp = await product('20')
    const page = await createPage('/')
    await checkoutWith(page, lamp.variants[0]!.id)
    await fillGuest(page, `${unique('bo')}@example.com`)
    await page.getByRole('radio', { name: new RegExp(courier.name) }).click()
    await total(page).getByText('$25.00').waitFor()
    await db.update(productVariants).set({ price: '30' }).where(eq(productVariants.id, lamp.variants[0]!.id))

    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.getByText('Your total changed to $35.00').waitFor()
    await total(page).getByText('$35.00').waitFor()
    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.waitForURL(/\/orders\/\d+\?hash=/)
  })

  test('when an item sold out meanwhile, sends the buyer back to the cart', async () => {
    const lamp = await product('20', 3)
    const page = await createPage('/')
    await checkoutWith(page, lamp.variants[0]!.id, 2)
    await fillGuest(page, `${unique('cy')}@example.com`)
    await page.getByRole('radio', { name: new RegExp(courier.name) }).click()
    await db.update(productVariants).set({ stockQuantity: 1 }).where(eq(productVariants.id, lamp.variants[0]!.id))

    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.getByText(/^Only 1 left of /).waitFor()
    await page.getByRole('link', { name: 'Review your cart' }).click()
    await page.waitForURL('**/cart')
  })

  test('a member checks out with a saved address and loyalty points', async () => {
    await new LoyaltyService(db).updateSettings({ isEnabled: true, redeemRate: '0.5' })
    const email = `${unique('dee')}@example.com`
    const page = await signedInPage(db, email)
    const userId = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    await db.insert(loyaltyPoints).values({ userId, orderId: 0, earnedPoints: '20' })
    await page.evaluate(async () => {
      await fetch('/api/store/addresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ line1: '9 Lake Rd', city: 'Pokhara', country: 'Nepal', isDefault: true }),
      })
    })
    const lamp = await product('40')
    await checkoutWith(page, lamp.variants[0]!.id)

    await page.getByText(`Signed in as ${email}`).waitFor()
    await page.getByRole('radio', { name: /9 Lake Rd/ }).waitFor()
    expect(await page.getByRole('radio', { name: /9 Lake Rd/ }).isChecked()).toBe(true)
    await page.getByRole('radio', { name: new RegExp(courier.name) }).click()
    await page.getByLabel('Points to use').fill('10')
    await page.getByLabel('Points to use').press('Tab')
    // 10 points at 0.5 each take $5 off: 40 - 5 + 5 shipping
    await total(page).getByText('$40.00').waitFor()
    await page.getByRole('button', { name: /^Place order/ }).click()

    await page.waitForURL(/\/orders\/\d+\?hash=/)
    const id = Number(new URL(page.url()).pathname.split('/').pop())
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    expect(order).toMatchObject({ userId, shippingAddress: { line1: '9 Lake Rd', city: 'Pokhara', country: 'Nepal' } })
    expect(Number(order!.loyaltyDiscount)).toBe(5)
  })
})
