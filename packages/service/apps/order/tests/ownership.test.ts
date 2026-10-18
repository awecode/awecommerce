// Products a person buys once (an ebook): one in the cart, sign-in to order,
// and not again while a paid order has it
import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { OrderService } from 'apps/order/services/order'
import { OwnershipService } from 'apps/order/services/ownership'
import { ProductClassService, ProductService } from 'apps/product/services/product'
import { MembershipService } from 'apps/membership/services/membership'

const carts = new CartService(db)
const orders = new OrderService(db)
const ownership = new OwnershipService(db)

let count = 0
const unique = (name: string) => `ownership-${name}-${++count}`

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

// An ebook with two variants (PDF and EPUB) in a once per person class
const createEbook = async () => {
  const ebooks = await new ProductClassService(db).create({ name: unique('Ebook'), slug: unique('ebook'), requiresShipping: false, oncePerPerson: true })
  const slug = unique('ebook')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 100, status: 'Published', productClassId: ebooks.id })
  const epub = unique('epub')
  const second = await new ProductService(db).create({ name: epub, slug: epub, sku: epub, price: '10', stockQuantity: 100, status: 'Published', productClassId: ebooks.id })
  return { product, pdf: product.variants[0].id, epub: second.variants[0].id }
}
const plainProduct = async () => {
  const slug = unique('mug')
  return (await new ProductService(db).create({ name: slug, slug, sku: slug, price: '5', stockQuantity: 100, status: 'Published' })).variants[0].id
}
const lines = async (sessionId: string) => (await carts.getCartContentForSession(sessionId)).lines.map((l) => [l.variantId, l.quantity]).sort()

test('one of a once per person variant in the cart', async () => {
  const { product, pdf } = await createEbook()
  const mug = await plainProduct()
  const cart = await carts.create(unique('user'))

  await expect(carts.addToCart(cart.id, pdf, 2)).rejects.toThrow(`Only one ${product.name} can be bought`)
  await carts.addToCart(cart.id, pdf, 1)
  await carts.addToCart(cart.id, pdf, 1)
  await carts.addToCart(cart.id, mug, 1)
  await carts.addToCart(cart.id, mug, 1)
  expect(await lines(cart.sessionId)).toEqual([[pdf, 1], [mug, 2]].sort())

  const line = (await carts.getCartContentForSession(cart.sessionId)).lines.find((l) => l.variantId === pdf)!
  await expect(carts.updateQuantity(cart.id, line.id, 2)).rejects.toThrow('Only one of this can be bought')

  const summary = await carts.getCartSummary(cart.sessionId)
  expect(summary.requiresAccount).toBe(true)
  expect(summary.lines.map((l) => [l.variantId, l.oncePerPerson, l.ownedInOrder]).sort()).toEqual([[pdf, true, null], [mug, false, null]].sort())
})

test('a guest signs in to order it', async () => {
  const { product, pdf } = await createEbook()
  const guest = await carts.create()
  await carts.addToCart(guest.id, pdf, 1)
  await expect(orders.createFromCart(guest.id)).rejects.toThrow(`Sign in to buy ${product.name}`)
})

test('not bought again while a paid order has it; another variant, or after cancelling, is fine', async () => {
  const { product, pdf, epub } = await createEbook()
  const user = unique('user')
  const first = await carts.create(user)
  await carts.addToCart(first.id, pdf, 1)
  const order = await orders.createFromCart(first.id)

  // Unpaid: it can be ordered again
  const second = await carts.create(user)
  await carts.addToCart(second.id, pdf, 1)
  await orders.changePaymentStatus(order.id, 'Paid')
  expect(await ownership.ownedVariants(user, [pdf, epub])).toEqual(new Map([[pdf, order.id]]))

  // Paid: refused when adding, flagged in the cart, and refused at checkout
  const third = await carts.create(user)
  await expect(carts.addToCart(third.id, pdf, 1)).rejects.toThrow(`You already own ${product.name}`)
  await carts.addToCart(third.id, epub, 1)
  expect((await carts.getCartSummary(second.sessionId)).lines[0]!.ownedInOrder).toBe(order.id)
  await expect(orders.createFromCart(second.id)).rejects.toThrow(`You already own ${product.name}`)

  // Cancelled: owned no more
  await orders.cancel(order.id, 'staff', 'Changed their mind')
  expect(await ownership.ownedVariants(user, [pdf])).toEqual(new Map())
  expect((await orders.createFromCart(second.id)).lines).toHaveLength(1)
})

test('the other unpaid, unconfirmed orders with it', async () => {
  const { pdf } = await createEbook()
  const mug = await plainProduct()
  const user = unique('user')
  const order = async (variantId: number) => {
    const cart = await carts.create(user)
    await carts.addToCart(cart.id, variantId, 1)
    return (await orders.createFromCart(cart.id)).id
  }
  const [abandoned, confirmed, paid, other] = [await order(pdf), await order(pdf), await order(pdf), await order(pdf)]
  await order(mug)
  await orders.changeStatus(confirmed, 'Confirmed')
  await orders.changePaymentStatus(paid, 'Paid')
  await orders.cancel(other, 'staff', 'Test')
  expect(await ownership.unpaidOrdersWith(user, [pdf], paid)).toEqual([abandoned])
})

test('a membership is one in the cart but never owned, so it can be renewed', async () => {
  const memberships = new MembershipService(db)
  const plan = await memberships.createPlan({ name: unique('Gold'), slug: unique('gold'), program: unique('music'), rank: 1 })
  const slug = unique('gold-year')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 10, status: 'Published' })
  const variant = product.variants[0].id
  await memberships.addTerm({ planId: plan.id, variantId: variant, months: 12 })
  const user = unique('user')

  const cart = await carts.create(user)
  await expect(carts.addToCart(cart.id, variant, 2)).rejects.toThrow(`Only one ${product.name} can be bought`)
  await carts.addToCart(cart.id, variant, 1)
  await orders.changePaymentStatus((await orders.createFromCart(cart.id)).id, 'Paid')

  const again = await carts.create(user)
  await carts.addToCart(again.id, variant, 1)
  expect((await carts.getCartSummary(again.sessionId)).lines[0]).toMatchObject({ oncePerPerson: true, ownedInOrder: null })
})

test('signing in keeps one of it', async () => {
  const { pdf } = await createEbook()
  const user = unique('user')
  const account = await carts.create(user)
  await carts.addToCart(account.id, pdf, 1)
  const guest = await carts.create()
  await carts.addToCart(guest.id, pdf, 1)
  const merged = await carts.mergeCarts(user, guest.sessionId)
  expect(merged.lines.map((l) => [l.variantId, l.quantity])).toEqual([[pdf, 1]])
})
