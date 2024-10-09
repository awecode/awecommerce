import { faker } from '@faker-js/faker'
import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from '../../../core/db'
import { products } from '../schemas'
import { productService } from '../services/product'

test('should create a product', async () => {
  const name = faker.commerce.productName()
  const description = faker.commerce.productDescription()
  const price = faker.number.int({ min: 10, max: 100 }).toString()
  const product = await productService.create({
    name,
    description,
    price: price,
  })
  expect(product).toBeDefined()
  expect(product.name).toBe(name)
  expect(product.description).toBe(description)
  expect(product.price).toBe(price)
  const result = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id))
  expect(result).toHaveLength(1)
  const productFromDb = result[0]
  expect(productFromDb.name).toBe(name)
  expect(productFromDb.description).toBe(description)
  expect(productFromDb.price).toBe(price)
})

test('should filter products', async () => {
  const products = await productService.filter({
    status: 'Draft',
  })
  expect(products).toHaveLength(1)
})

test('should mark a product as featured', async () => {
  const product = await productService.markAsFeatured(1)
  expect(product).toBeDefined()
  expect(product.isFeatured).toBe(true)
})

test('should unmark a product as featured', async () => {
  const product = await productService.unmarkAsFeatured(1)
  expect(product).toBeDefined()
  expect(product.isFeatured).toBe(false)
})

test('should mark a product as best seller', async () => {
  const product = await productService.markAsBestSeller(1)
  expect(product).toBeDefined()
  expect(product.isBestSeller).toBe(true)
})

test('should unmark a product as best seller', async () => {
  const product = await productService.unmarkAsBestSeller(1)
  expect(product).toBeDefined()
  expect(product.isBestSeller).toBe(false)
})

test('should get a product', async () => {
  const product = await productService.get(1)
  expect(product).toBeDefined()
  expect(product.id).toBe(1)
})

test('should update a product', async () => {
  const product = await productService.update(1, {
    name: 'Updated Product',
    description: 'Updated Description',
    price: '150',
  })
  expect(product).toBeDefined()
  expect(product.name).toBe('Updated Product')
  expect(product.description).toBe('Updated Description')
  expect(product.price).toBe('150')
})

test('should delete a product', async () => {
  const product = await productService.delete(1)
  expect(product).toBeDefined()
  expect(product.id).toBe(1)
  const result = await db.select().from(products).where(eq(products.id, 1))
  expect(result).toHaveLength(0)
})
