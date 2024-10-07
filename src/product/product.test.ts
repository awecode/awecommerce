import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { productService } from './service'

import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import path from 'path'
import { client, db } from '../core/db'
import { products } from './schema'

const pgliteClient = client as PGlite

const doMigrate = async () => {
  const drizzle = drizzlePglite(pgliteClient)
  await migratePglite(drizzle, {
    migrationsFolder: path.join(process.cwd(), 'drizzle'),
  })
}

test('should create a product', async () => {
  await doMigrate()
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
