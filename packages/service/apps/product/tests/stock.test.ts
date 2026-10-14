import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { OrderService } from 'apps/order/services/order'
import {
  OutOfStockError,
  ProductClassService,
  ProductService,
  ProductVariantService,
} from 'apps/product/services/product'

const productService = new ProductService(db)
const variantService = new ProductVariantService(db)
const cartService = new CartService(db)
const orderService = new OrderService(db)

let count = 0
const createProduct = async (stockQuantity: number, productClassId?: number) => {
  const slug = `stock-product-${++count}-${Date.now()}`
  return await productService.create({ status: 'Published', name: slug, slug, sku: slug, price: '10', stockQuantity, productClassId })
}
const untrackedClass = async () =>
  (await new ProductClassService(db).create({ name: `Untracked ${++count}`, slug: `untracked-${count}-${Date.now()}`, trackStock: false })).id
const stockOf = async (variantId: number) => (await variantService.get(variantId))!.stockQuantity

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

test('adding to the cart is refused beyond the stock, counting every line of the variant', async () => {
  const product = await createProduct(3)
  const variantId = product.variants[0].id
  const cart = await cartService.create()

  await cartService.addToCart(cart.id, variantId, 2)
  // Another line of the same variant, with other answers, would count too
  const error = await cartService.addToCart(cart.id, variantId, 2).catch((e) => e)
  expect(error).toBeInstanceOf(OutOfStockError)
  expect(error.message).toBe(`Only 3 left of ${product.variants[0].sku}`)
  expect(error).toMatchObject({ variantId, sku: product.variants[0].sku, available: 3 })

  await cartService.addToCart(cart.id, variantId, 1)
  const [line] = (await cartService.getCartContentForSession(cart.sessionId)).lines
  await expect(cartService.updateQuantity(cart.id, line.id, 4)).rejects.toThrow(OutOfStockError)
  await cartService.updateQuantity(cart.id, line.id, 2)
})

test('an empty variant is out of stock, unless its class does not track stock', async () => {
  const empty = await createProduct(0)
  const cart = await cartService.create()
  await expect(cartService.addToCart(cart.id, empty.variants[0].id, 1)).rejects.toThrow(
    `${empty.variants[0].sku} is out of stock`,
  )

  const untracked = await createProduct(0, await untrackedClass())
  await cartService.addToCart(cart.id, untracked.variants[0].id, 50)
})

test('the cart summary flags lines with more than is in stock', async () => {
  const product = await createProduct(5)
  const variantId = product.variants[0].id
  const cart = await cartService.create()
  await cartService.addToCart(cart.id, variantId, 4)
  const untracked = await createProduct(0, await untrackedClass())
  await cartService.addToCart(cart.id, untracked.variants[0].id, 1)

  let summary = await cartService.getCartSummary(cart.sessionId)
  expect(summary.lines.map((l) => [l.isInStock, l.stockLeft])).toEqual([[true, 5], [true, null]])

  await variantService.update(variantId, { stockQuantity: 2 })
  summary = await cartService.getCartSummary(cart.sessionId)
  expect(summary.lines.map((l) => [l.isInStock, l.stockLeft])).toEqual([[false, 2], [true, null]])
})

test('placing an order takes the stock, and cancelling it gives the stock back', async () => {
  const tracked = await createProduct(5)
  const untracked = await createProduct(0, await untrackedClass())
  const cart = await cartService.create('stock-buyer')
  await cartService.addToCart(cart.id, tracked.variants[0].id, 2)
  await cartService.addToCart(cart.id, untracked.variants[0].id, 3)

  const order = await orderService.createFromCart(cart.id)
  expect(await stockOf(tracked.variants[0].id)).toBe(3)
  expect(await stockOf(untracked.variants[0].id)).toBe(0)

  // A class that starts tracking later does not change what the order took
  await new ProductClassService(db).update(untracked.productClassId!, { trackStock: true })
  await orderService.cancel(order.id, 'staff', 'Changed mind')
  expect(await stockOf(tracked.variants[0].id)).toBe(5)
  expect(await stockOf(untracked.variants[0].id)).toBe(0)
})

test('checkout fails without changes when stock ran out after adding to the cart', async () => {
  const product = await createProduct(4)
  const variantId = product.variants[0].id
  const cart = await cartService.create('stock-late-buyer')
  await cartService.addToCart(cart.id, variantId, 3)
  await variantService.update(variantId, { stockQuantity: 1 })

  const error = await orderService.createFromCart(cart.id).catch((e) => e)
  expect(error).toBeInstanceOf(OutOfStockError)
  expect(error).toMatchObject({ variantId, available: 1 })
  expect(await stockOf(variantId)).toBe(1)
  expect((await cartService.getCartForUser('stock-late-buyer'))?.id).toBe(cart.id)
})

test('lists and shows whether products are in stock', async () => {
  const inStock = await createProduct(1)
  const soldOut = await createProduct(0)
  const untracked = await createProduct(0, await untrackedClass())

  const rows = await productService.list({ q: 'stock-product-', includeInactiveProductClasses: true })
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.inStock]))
  expect([byId[inStock.id], byId[soldOut.id], byId[untracked.id]]).toEqual([true, false, true])

  expect((await productService.get(soldOut.id))!.productClass).toBeNull()
  expect((await productService.get(untracked.id))!.productClass).toMatchObject({ trackStock: false })
})
