import { afterAll, describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { startFakeStripe, WEBHOOK_SECRET } from '../../../packages/payment-stripe/tests/fake-stripe'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('online payments in the backoffice', async () => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
  const stripe = await startFakeStripe()
  afterAll(() => stripe.close())
  process.env.NUXT_PAYMENT_METHODS = 'cash_on_delivery,stripe'
  process.env.NUXT_STRIPE_SECRET_KEY = 'sk_test_fake'
  process.env.NUXT_STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.NUXT_STRIPE_API_BASE = stripe.base
  const db = await setupBackoffice()
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const orders = new OrderService(db)

  // A guest's order of one item at 40, to pay by card
  const cardOrder = async () => {
    const slug = unique('desk')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '40', stockQuantity: 10, status: 'Published' })
    const cart = await new CartService(db).create()
    await new CartService(db).addToCart(cart.id, product.variants[0]!.id, 1)
    return await orders.createFromCart(cart.id, {
      guestUser: { name: 'Gus Guest', email: `${unique('gus')}@example.com` },
      shippingAddress: { line1: '1 Lakeside', city: 'Pokhara', country: 'Nepal' },
      paymentMethod: 'stripe',
    })
  }
  const openOrder = async (id: number) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}/orders/${id}`)
    return page
  }

  test('an unpaid card order awaits payment instead of being confirmed', async () => {
    const order = await cardOrder()
    const page = await openOrder(order.id)
    await page.getByText('Awaiting payment').waitFor()
    expect(await page.getByRole('button', { name: 'Confirm order' }).count()).toBe(0)
    await page.getByText('Card', { exact: true }).waitFor()
    expect(await page.getByRole('button', { name: /^Refund through/ }).count()).toBe(0)
  })

  test('a paid card order is confirmed as usual, and refunded through Stripe', async () => {
    const order = await cardOrder()
    await orders.recordPayment(order.id, { amount: order.total, reference: 'pi_backoffice', method: 'stripe', label: 'Card' })
    const page = await openOrder(order.id)
    await page.getByRole('button', { name: 'Confirm order' }).waitFor()

    await page.getByRole('button', { name: 'Refund through Card' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Refund' }).click()
    await page.getByTestId('payment-status').getByText('Payment Refunded').waitFor()
    expect(stripe.refunds.at(-1)).toMatchObject({ payment_intent: 'pi_backoffice' })
    expect((await orders.get(order.id))!.paymentStatus).toBe('Refunded')
  })
})
