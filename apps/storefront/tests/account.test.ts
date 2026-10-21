import { createPage } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { loyaltyPoints } from '@awecommerce/service/apps/loyalty/schemas'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { setupStorefront, signedInPage, url } from './helpers'

type Page = Awaited<ReturnType<typeof createPage>>

describe.skipIf(!url)('account', async () => {
  const db = await setupStorefront()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const base = () => process.env.BETTER_AUTH_URL!

  const member = async () => {
    const email = `${unique('member')}@example.com`
    const page = await signedInPage(db, email)
    const userId: string = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    return { page, email, userId }
  }

  // An order placed for the user, the way checkout does
  const placeOrder = async (userId: string, price = '30') => {
    const slug = unique('vase')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity: 10, status: 'Published' })
    const cart = await new CartService(db).create(userId)
    await new CartService(db).addToCart(cart.id, product.variants[0]!.id, 1)
    return await new OrderService(db).createFromCart(cart.id, { shippingAddress: { line1: '1 Main St', city: 'Kathmandu', country: 'Nepal' } })
  }

  const addAddress = (page: Page, body: Record<string, unknown>) =>
    page.evaluate(async (b) => {
      await fetch('/api/store/addresses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    }, body)

  test('account pages ask guests to sign in and come back after; signed in, /login moves on', async () => {
    const guest = await createPage('/account')
    await guest.waitForURL('**/login?redirect=/account')
    await guest.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor()
    await guest.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await guest.getByText('Enter a valid email address').waitFor()

    const { page } = await member()
    await page.goto(`${base()}/login`)
    await page.waitForURL(`${base()}/`)
  })

  test('the overview shows points, recent orders and the default address', async () => {
    await new LoyaltyService(db).updateSettings({ isEnabled: true, redeemRate: '0.5' })
    const { page, email, userId } = await member()
    await db.insert(loyaltyPoints).values({ userId, orderId: 0, earnedPoints: '30' })
    const order = await placeOrder(userId)
    await addAddress(page, { line1: '9 Lake Rd', city: 'Pokhara', country: 'Nepal', isDefault: true })

    await page.goto(`${base()}/account`)
    await page.getByRole('heading', { level: 1, name: 'Your account' }).waitFor()
    await page.getByText(email).first().waitFor()
    await page.getByTestId('points').getByText('30').waitFor()
    await page.getByText('Worth $15.00. Use them at checkout.').waitFor()
    await page.getByRole('link', { name: `Order ${order.id}` }).waitFor()
    await page.getByText('9 Lake Rd, Pokhara, Nepal').waitFor()
  })

  test('lists the orders and opens one; others cannot see it', async () => {
    const { page, userId } = await member()
    const first = await placeOrder(userId, '10')
    const second = await placeOrder(userId, '20')

    await page.goto(`${base()}/account/orders`)
    const rows = page.getByRole('link', { name: /^Order \d+$/ })
    await rows.first().waitFor()
    expect(await rows.allTextContents()).toHaveLength(2)
    expect(await rows.first().getAttribute('aria-label')).toBe(`Order ${second.id}`)

    await page.getByRole('link', { name: `Order ${first.id}` }).click()
    await page.waitForURL(`**/orders/${first.id}`)
    await page.getByRole('heading', { level: 1, name: `Order ${first.id}` }).waitFor()
    await page.getByTestId('order-total').getByText('$10.00').waitFor()
    await page.getByRole('link', { name: 'All orders' }).waitFor()

    const other = await member()
    expect((await other.page.goto(`${base()}/orders/${first.id}`))?.status()).toBe(404)
    const guest = await createPage(`/orders/${first.id}`)
    await guest.waitForURL(`**/login?redirect=/orders/${first.id}`)
  })

  test('adds, edits, makes default and deletes addresses', async () => {
    const { page } = await member()
    await page.goto(`${base()}/account/addresses`)

    await page.getByRole('button', { name: 'Add an address' }).click()
    await page.getByRole('button', { name: 'Save address' }).click()
    await page.getByText('Enter the street address').waitFor()
    await page.getByLabel('Address', { exact: true }).fill('9 Lake Rd')
    await page.getByLabel('City').fill('Pokhara')
    await page.getByLabel('Country').fill('Nepal')
    await page.getByRole('button', { name: 'Save address' }).click()
    const lake = page.getByRole('article', { name: '9 Lake Rd, Pokhara, Nepal' })
    await lake.getByText('Default', { exact: true }).waitFor()

    await lake.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('City').fill('Lalitpur')
    await page.getByRole('button', { name: 'Save address' }).click()
    const edited = page.getByRole('article', { name: '9 Lake Rd, Lalitpur, Nepal' })
    await edited.waitFor()

    await page.getByRole('button', { name: 'Add an address' }).click()
    await page.getByLabel('Address', { exact: true }).fill('2 Hill St')
    await page.getByLabel('City').fill('Dharan')
    await page.getByLabel('Country').fill('Nepal')
    await page.getByRole('button', { name: 'Save address' }).click()
    const hill = page.getByRole('article', { name: '2 Hill St, Dharan, Nepal' })
    await hill.getByRole('button', { name: 'Make default' }).click()
    await hill.getByText('Default', { exact: true }).waitFor()
    await expect.poll(() => edited.getByText('Default', { exact: true }).count()).toBe(0)

    await edited.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect.poll(() => edited.count()).toBe(0)
  })
})
