import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, test } from 'vitest'

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

test('should roll back order creation when a line fails', async () => {
  const userId = 'order-rollback-user'
  const cart = await new CartService(db).create(userId)
  const missingProductLine = {
    id: 1,
    cartId: cart.id,
    productId: 999999,
    quantity: 1,
    createdAt: null,
    updatedAt: null,
    product: { price: '10' },
  }
  await expect(
    orderService.create({ userId, cartId: cart.id }, [missingProductLine]),
  ).rejects.toThrow()
  expect(await db.select().from(orders).where(eq(orders.userId, userId))).toEqual([])
  const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
  expect(cartAfter.status).toBe('Open')
})

test('should roll back cancel when the status change fails', async () => {
  const userId = 'order-cancel-user'
  const product = await new ProductService(db).create({
    name: 'Cancel Product',
    slug: 'cancel-product',
    sku: 'cancel-product',
    price: '10',
  })
  const line = {
    id: 1,
    cartId: 0,
    productId: product.id,
    quantity: 1,
    createdAt: null,
    updatedAt: null,
    product: { price: '10' },
  }
  const order = await orderService.create({ userId }, [line])
  await expect(
    orderService.cancel(order.id, 'NotAStatus' as any, 'admin', 'reason'),
  ).rejects.toThrow()
  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, order.id))
  expect(orderAfter.status).toBe('Pending')
})

test('should reject creating an order without lines', async () => {
  const userId = 'order-empty-user'
  await expect(orderService.create({ userId }, [])).rejects.toThrow(
    'Cannot create an order without lines',
  )
  expect(await db.select().from(orders).where(eq(orders.userId, userId))).toEqual([])
})
