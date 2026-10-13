import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { products } from '../schemas/pg'

import { ProductService } from 'apps/product/services/product'

const productService = new ProductService(db)

test('should create a product', async () => {
  const name = faker.commerce.productName()
  const description = faker.commerce.productDescription()
  const price = faker.number.int({ min: 10, max: 100 }).toString()
  const product = await productService.create({
    name,
    slug: name,
    sku: name,
    description,
    price: price,
  })
  expect(product).toBeDefined()
  expect(product.name).toBe(name)
  expect(product.description).toBe(description)
  expect(Number(product.price)).toBe(Number(price))
  const result = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id))
  expect(result).toHaveLength(1)
  const productFromDb = result[0]
  expect(productFromDb.name).toBe(name)
  expect(productFromDb.description).toBe(description)
  expect(Number(productFromDb.price)).toBe(Number(price))
})

test('should list products applying given filter', async () => {
  const products = await productService.list({
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
  expect(product!.id).toBe(1)
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
  expect(Number(product.price)).toBe(150)
})

test('should delete a product', async () => {
  const product = await productService.delete(1)
  expect(product).toBeDefined()
  expect(product.id).toBe(1)
  const result = await db.select().from(products).where(eq(products.id, 1))
  expect(result).toHaveLength(0)
})

test('should roll back product creation when related products fail', async () => {
  await expect(
    productService.create({
      name: 'Rollback Product',
      slug: 'rollback-product',
      sku: 'rollback-product',
      price: '10',
      relatedProducts: [999999],
    }),
  ).rejects.toThrow()
  expect(
    await db.select().from(products).where(eq(products.slug, 'rollback-product')),
  ).toEqual([])
})

test('should return recently viewed products, latest first', async () => {
  const userId = 'recent-viewer'
  const created = []
  for (const name of ['Viewed A', 'Viewed B', 'Viewed C']) {
    created.push(
      await productService.create({ name, slug: name, sku: name, price: '10' }),
    )
  }
  const [a, b, c] = created
  const inactive = await productService.create({
    name: 'Viewed Inactive',
    slug: 'viewed-inactive',
    sku: 'viewed-inactive',
    price: '10',
    isActive: false,
  })
  for (const product of [a, b, a, c, inactive]) {
    await productService.logProductView(product.id, userId)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  const recent = await productService.getRecentlyViewedProducts(userId, 10)
  expect(recent.map((p) => p.id)).toEqual([c.id, a.id, b.id])

  const limited = await productService.getRecentlyViewedProducts(userId, 2)
  expect(limited.map((p) => p.id)).toEqual([c.id, a.id])
})
