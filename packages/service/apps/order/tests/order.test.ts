import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'
import { carts } from 'apps/cart/schemas'
import { orders } from 'apps/order/schemas'
import { eq } from 'drizzle-orm'

const orderService = new OrderService(db)

const originalSecret = process.env.ORDER_HASH_SECRET

beforeEach(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.ORDER_HASH_SECRET
  } else {
    process.env.ORDER_HASH_SECRET = originalSecret
  }
})

test('should verify a generated order hash', () => {
  const hash = orderService.generateHash('42')
  expect(orderService.checkHash('42', hash)).toBe(true)
})

test('should reject a hash for a different order or a tampered hash', () => {
  const hash = orderService.generateHash('42')
  expect(orderService.checkHash('43', hash)).toBe(false)
  expect(orderService.checkHash('42', hash.slice(0, -2) + 'AA')).toBe(false)
  expect(orderService.checkHash('42', 'short')).toBe(false)
})

test('should not be computable from the order id alone', () => {
  const plainSha256 = createHash('sha256').update('42').digest('base64')
  expect(orderService.checkHash('42', plainSha256)).toBe(false)
})

test('should depend on the secret', () => {
  const hash = orderService.generateHash('42')
  process.env.ORDER_HASH_SECRET = 'other-secret'
  expect(orderService.generateHash('42')).not.toBe(hash)
})

test('should throw when the secret is not set', () => {
  delete process.env.ORDER_HASH_SECRET
  expect(() => orderService.generateHash('42')).toThrow(
    'ORDER_HASH_SECRET is not set',
  )
})

const createCartWithProduct = async (userId: string, slug: string) => {
  const product = await new ProductService(db).create({
    name: slug,
    slug,
    sku: slug,
    price: '10',
  })
  const cartService = new CartService(db)
  const cart = await cartService.create(userId)
  await cartService.addToCart(cart.id, product.variants[0].id, 1)
  return cart
}

test('should roll back order creation when a later write fails', async () => {
  const userId = 'order-rollback-user'
  const cart = await createCartWithProduct(userId, 'rollback-product')
  const spy = vi
    .spyOn(OrderService.prototype, 'createLog')
    .mockRejectedValueOnce(new Error('log failed'))
  await expect(orderService.createFromCart(cart.id)).rejects.toThrow('log failed')
  spy.mockRestore()
  expect(await db.select().from(orders).where(eq(orders.userId, userId))).toEqual([])
  const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
  expect(cartAfter.status).toBe('Open')
})

test('should roll back cancel when the status change fails', async () => {
  const userId = 'order-cancel-user'
  const cart = await createCartWithProduct(userId, 'cancel-product')
  const order = await orderService.createFromCart(cart.id)
  const spy = vi
    // recordStatusChange is private; cancel() calls it after giving usage back
    .spyOn(OrderService.prototype as any, 'recordStatusChange')
    .mockRejectedValueOnce(new Error('status change failed'))
  await expect(orderService.cancel(order.id, 'admin', 'reason')).rejects.toThrow(
    'status change failed',
  )
  spy.mockRestore()
  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.status).toBe('Pending')
})

test('should generate URL-safe hashes', () => {
  for (let id = 1; id <= 200; id++) {
    const hash = orderService.generateHash(id.toString())
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(orderService.checkHash(id.toString(), hash)).toBe(true)
  }
})
