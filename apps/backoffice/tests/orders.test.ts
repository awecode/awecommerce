import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { orders } from '@awecommerce/service/apps/order/schemas'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { ProductClassService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import * as authSchema from '../../../packages/auth/server/db/schema'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('orders', async () => {
  // Orders placed below get a link hash, as at checkout
  process.env.ORDER_HASH_SECRET = 'test-secret'
  const db = await setupBackoffice()
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const courier = await new ShippingMethodService(db).create({ name: unique('Courier'), price: '5' })

  // An order placed the way checkout does, for a guest or a member
  const placeOrder = async (buyer: { guest?: { name: string; email: string }; userId?: string }, price = '20') => {
    const slug = unique('lamp')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity: 10, status: 'Published' })
    const cart = await new CartService(db).create(buyer.userId)
    await new CartService(db).addToCart(cart.id, product.variants[0]!.id, 2)
    const order = await new OrderService(db).createFromCart(cart.id, {
      guestUser: buyer.guest,
      shippingAddress: { line1: '12 Lakeside Road', city: 'Pokhara', country: 'Nepal' },
      shippingMethodId: courier.id,
      metadata: { paymentMethod: 'pay_on_delivery' },
    })
    return { order, product }
  }
  const member = async (name: string) => {
    const id = randomUUID()
    const email = `${unique(name.toLowerCase())}@example.com`
    await db.insert(authSchema.users).values({ id, name, email })
    return { id, email }
  }

  const openPage = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('lists orders with their customers, by view, search and filters in the URL', async () => {
    const dee = await member('Dee')
    const memberOrder = (await placeOrder({ userId: dee.id })).order
    const guestEmail = `${unique('gus')}@example.com`
    const guestOrder = (await placeOrder({ guest: { name: 'Gus Guest', email: guestEmail } })).order
    await new OrderService(db).changeStatus(guestOrder.id, 'Completed')

    const page = await openPage('/orders')
    await page.getByRole('heading', { name: 'Orders' }).waitFor()
    const row = (id: number) => page.getByRole('row', { name: new RegExp(`#${id}\\b`) })

    // "To do" leaves out completed and cancelled orders
    await row(memberOrder.id).getByText('Dee', { exact: true }).waitFor()
    expect(await row(guestOrder.id).count()).toBe(0)
    await page.getByRole('tab', { name: 'All' }).click()
    await page.waitForURL('**view=all**')
    await row(guestOrder.id).getByText('Gus Guest').waitFor()
    await row(guestOrder.id).getByText('Guest', { exact: true }).waitFor()

    // Members are found by their email, which the order does not hold
    await page.getByPlaceholder('Search orders…').fill(dee.email)
    await page.waitForURL((u) => u.searchParams.get('q') === dee.email)
    await expect.poll(() => page.getByRole('row', { name: /#\d+/ }).count()).toBe(1)
    await row(memberOrder.id).waitFor()

    await page.goto(`${process.env.BETTER_AUTH_URL}/orders?view=all&status=Completed&q=${guestEmail}`)
    await row(guestOrder.id).waitFor()
    await row(guestOrder.id).click()
    await page.waitForURL(`**/orders/${guestOrder.id}`)
  })

  test('the order page shows the items, customer, delivery and totals', async () => {
    const { order, product } = await placeOrder({ guest: { name: 'Ann Buyer', email: `${unique('ann')}@example.com` } }, '20')
    const page = await openPage(`/orders/${order.id}`)

    await page.getByRole('heading', { name: `Order #${order.id}` }).waitFor()
    await page.getByRole('link', { name: product.name }).waitFor()
    await page.getByText('Ann Buyer').waitFor()
    await page.getByText('12 Lakeside Road').waitFor()
    await page.getByText(courier.name).waitFor()
    await page.getByText('Pay on delivery').waitFor()
    // 2 × $20 + $5 delivery
    await page.getByTestId('order-total').getByText('$45.00').waitFor()
  })

  test('moves an order along with the next-step button, and records payment', async () => {
    const { order } = await placeOrder({ guest: { name: 'Bo', email: `${unique('bo')}@example.com` } })
    const page = await openPage(`/orders/${order.id}`)
    const status = async () => (await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status

    for (const [button, next] of [
      ['Confirm order', 'Confirmed'],
      ['Start processing', 'Processing'],
      ['Mark shipped', 'Shipped'],
      ['Mark delivered', 'Delivered'],
    ] as const) {
      await page.getByRole('button', { name: button }).click()
      await expect.poll(status).toBe(next)
      await page.getByTestId('order-status').getByText(next).waitFor()
    }

    await page.getByRole('button', { name: 'Mark as paid' }).click()
    await page.getByTestId('payment-status').getByText('Paid').waitFor()
    // The history says who did it
    await page.getByRole('region', { name: 'History' }).getByText('Payment Paid').waitFor()
    await page.getByRole('region', { name: 'History' }).getByText(STAFF_EMAIL).first().waitFor()

    // Any other status is in the menu
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Move to Returned' }).click()
    await expect.poll(status).toBe('Returned')
  })

  test('an order with nothing to ship has no delivery, and goes Confirm, then Complete', async () => {
    const slug = unique('e-book')
    const digital = await new ProductClassService(db).create({ name: slug, slug, requiresShipping: false })
    const ebook = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '12', stockQuantity: 10, status: 'Published', productClassId: digital.id })
    const cart = await new CartService(db).create()
    await new CartService(db).addToCart(cart.id, ebook.variants[0]!.id, 1)
    const order = await new OrderService(db).createFromCart(cart.id, {
      guestUser: { name: 'Fay', email: `${unique('fay')}@example.com` },
      metadata: { paymentMethod: 'pay_later' },
    })
    const page = await openPage(`/orders/${order.id}`)
    const status = async () => (await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status

    await page.getByText('Nothing to ship').waitFor()
    await page.getByText('Pay later').waitFor()
    expect(await page.getByRole('heading', { name: 'Delivery address' }).count()).toBe(0)
    for (const [button, next] of [
      ['Confirm order', 'Confirmed'],
      ['Complete', 'Completed'],
    ] as const) {
      await page.getByRole('button', { name: button, exact: true }).click()
      await expect.poll(status).toBe(next)
      await page.getByTestId('order-status').getByText(next).waitFor()
    }
  })

  test('cancels an order with a reason', async () => {
    const { order } = await placeOrder({ guest: { name: 'Cy', email: `${unique('cy')}@example.com` } })
    const page = await openPage(`/orders/${order.id}`)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Cancel order' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Cancel order' }).click()
    await dialog.getByText('Enter a reason').waitFor()
    await dialog.getByLabel('Reason').fill('Out of stock')
    await dialog.getByRole('button', { name: 'Cancel order' }).click()

    await page.getByTestId('order-status').getByText('Cancelled').waitFor()
    await page.getByText('Out of stock').first().waitFor()
    expect(await page.getByRole('button', { name: 'More actions' }).count()).toBe(0)
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]).toMatchObject({ status: 'Cancelled', cancellationReason: 'Out of stock' })
  })
})
