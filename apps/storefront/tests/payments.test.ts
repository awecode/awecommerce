import { createPage } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, test } from 'vitest'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { startFakeStripe, WEBHOOK_SECRET } from '../../../packages/payment-stripe/tests/fake-stripe'
import { setupStorefront, url } from './helpers'

type Page = Awaited<ReturnType<typeof createPage>>

describe.skipIf(!url)('paying online', async () => {
  const stripe = await startFakeStripe()
  afterAll(() => stripe.close())
  process.env.NUXT_PAYMENT_METHODS = 'cash_on_delivery,stripe'
  process.env.NUXT_STRIPE_SECRET_KEY = 'sk_test_fake'
  process.env.NUXT_STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.NUXT_STRIPE_API_BASE = stripe.base
  const db = await setupStorefront()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`

  // A guest's checkout of one item at 30, paying by card: on Stripe's page
  const payByCard = async () => {
    const slug = unique('chair')
    const chair = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '30', stockQuantity: 10, status: 'Published' })
    const page = await createPage('/')
    await page.evaluate(async (body) => {
      await fetch('/api/store/cart/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    }, { variantId: chair.variants[0]!.id, quantity: 1 })
    await page.goto(`${process.env.BETTER_AUTH_URL}/checkout`)
    await page.getByLabel('Name', { exact: true }).fill('Ann Buyer')
    await page.getByLabel('Email').fill(`${unique('ann')}@example.com`)
    await page.getByLabel('Address', { exact: true }).fill('1 Main St')
    await page.getByLabel('City').fill('Kathmandu')
    await page.getByLabel('Country').fill('Nepal')
    await page.getByRole('radio', { name: /^Card/ }).click()
    await page.getByRole('button', { name: /^Place order/ }).click()
    await page.getByRole('heading', { name: 'Stripe test checkout' }).waitFor()
    return page
  }
  const orderId = (page: Page) => Number(new URL(page.url()).pathname.split('/').pop())

  test('a buyer pays by card and comes back to a paid order', async () => {
    const page = await payByCard()
    await page.getByRole('link', { name: 'Pay' }).click()
    await page.waitForURL(/\/orders\/\d+\?hash=/)
    await page.getByText('Payment paid').waitFor()
    expect(await page.getByRole('button', { name: 'Pay now' }).count()).toBe(0)
    expect((await new OrderService(db).get(orderId(page)))!.paymentStatus).toBe('Paid')
  })

  test('a cancelled payment says so; Pay now can switch to cash on delivery', async () => {
    const page = await payByCard()
    await page.getByRole('link', { name: 'Cancel' }).click()
    await page.waitForURL(/\/orders\/\d+\?hash=/)
    await page.getByText('Your last payment did not go through: You cancelled the payment.').waitFor()

    await page.getByRole('radio', { name: /^Cash on delivery/ }).click()
    await page.getByRole('button', { name: 'Pay now' }).click()
    await expect.poll(() => page.getByRole('button', { name: 'Pay now' }).count()).toBe(0)
    await page.getByRole('region', { name: 'Payment' }).getByText('Pay the courier when your order arrives.').waitFor()
    expect((await new OrderService(db).get(orderId(page)))!.paymentMethod).toBe('cash_on_delivery')
  })

  test('Pay now goes back to the card page, and paying there settles it', async () => {
    const page = await payByCard()
    await page.getByRole('link', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Pay now' }).click()
    await page.getByRole('heading', { name: 'Stripe test checkout' }).waitFor()
    await page.getByRole('link', { name: 'Pay' }).click()
    await page.getByText('Payment paid').waitFor()
  })
})
