import { faker } from '@faker-js/faker'
import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from '../../../core/db'
import { products } from '../schemas'
import { productService } from '../services/product'

test('should create a product', async () => {
  const name = faker.commerce.productName()
  const description = faker.commerce.productDescription()
  const price = faker.number.int({ min: 10, max: 100 })
  const product = await productService.createProduct({
    name,
    description,
    price,
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
  const products = await productService.filterProducts({
    status: 'Draft',
  })
  expect(products).toHaveLength(1)
})
