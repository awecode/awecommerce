import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { db } from 'core/db'
import { OrderService } from 'apps/order/services/order'

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
