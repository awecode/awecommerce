import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { products } from '../schemas/pg'

import {
  ProductImageService,
  ProductOptionService,
  ProductService,
  ProductVariantService,
} from 'apps/product/services/product'

const productService = new ProductService(db)
const variantService = new ProductVariantService(db)
const optionService = new ProductOptionService(db)
const imageService = new ProductImageService(db)

const createProduct = async (name: string, price = '10') =>
  await productService.create({ name, slug: name, sku: name, price })

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
  expect(product.variants).toHaveLength(1)
  expect(product.variants[0].sku).toBe(name)
  expect(Number(product.variants[0].price)).toBe(Number(price))
  expect(product.variants[0].isActive).toBe(true)
  const result = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id))
  expect(result).toHaveLength(1)
  const productFromDb = result[0]
  expect(productFromDb.name).toBe(name)
  expect(productFromDb.description).toBe(description)
  const variants = await variantService.list(product.id)
  expect(variants.map((v) => [v.sku, Number(v.price), v.options])).toEqual([
    [name, Number(price), []],
  ])
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
  })
  expect(product).toBeDefined()
  expect(product.name).toBe('Updated Product')
  expect(product.description).toBe('Updated Description')
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

test('should add variants with options and share the options of the product', async () => {
  const product = await createProduct('Options Shirt')
  await variantService.update(product.variants[0].id, {
    title: 'Red / M',
    options: { Color: 'Red', Size: 'M' },
  })
  await variantService.create(product.id, {
    sku: 'options-shirt-blue-m',
    title: 'Blue / M',
    price: '12',
    options: { Color: 'Blue', Size: 'M' },
  })

  const found = await productService.get(product.id)
  expect(found!.variants.map((v) => [v.title, v.options])).toEqual([
    ['Red / M', [{ name: 'Color', value: 'Red' }, { name: 'Size', value: 'M' }]],
    ['Blue / M', [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'M' }]],
  ])
  expect(
    found!.options.map((o) => [o.name, o.values.map((v) => v.value)]),
  ).toEqual([
    ['Color', ['Red', 'Blue']],
    ['Size', ['M']],
  ])
})

test('should reject a variant with the same options as another variant', async () => {
  const product = await createProduct('Duplicate Shirt')
  await variantService.update(product.variants[0].id, { options: { Size: 'M' } })
  await expect(
    variantService.create(product.id, {
      sku: 'duplicate-shirt-m',
      options: { Size: 'M' },
    }),
  ).rejects.toThrow('A variant with these options already exists')
  expect(await variantService.list(product.id)).toHaveLength(1)

  // Another product can use the same options
  const other = await createProduct('Other Duplicate Shirt')
  await variantService.update(other.variants[0].id, { options: { Size: 'M' } })
})

test('should remove a deleted option value from its variants', async () => {
  const product = await createProduct('Delete Option Shirt')
  await variantService.update(product.variants[0].id, {
    options: { Color: 'Red', Size: 'M' },
  })
  const [, size] = await optionService.list(product.id)
  await optionService.delete(size.id)
  expect((await variantService.get(product.variants[0].id))!.options).toEqual([
    { name: 'Color', value: 'Red' },
  ])
})

test('should delete the variants that use a deleted option value', async () => {
  const product = await createProduct('Delete Value Shirt')
  await variantService.generateVariants(product.id, { Size: ['S', 'M'], Color: ['Red', 'Blue'] })
  const [size] = await optionService.list(product.id)
  const medium = size.values.find((v) => v.value === 'M')!

  await optionService.deleteValue(medium.id)

  const left = await variantService.list(product.id)
  expect(left.map((v) => v.options.map((o) => o.value).join('/')).sort()).toEqual(['S/Blue', 'S/Red'])
  expect((await optionService.list(product.id))[0].values.map((v) => v.value)).toEqual(['S'])
})

test('should refuse to delete the option value of every variant', async () => {
  const product = await createProduct('Only Value Shirt')
  await variantService.update(product.variants[0].id, { options: { Size: 'M' } })
  const [size] = await optionService.list(product.id)

  await expect(optionService.deleteValue(size.values[0].id)).rejects.toThrow(
    'Deleting M would delete every variant; delete the option instead',
  )
  expect(await variantService.list(product.id)).toHaveLength(1)
})

test('should refuse to delete an option while more than one of its values is used', async () => {
  const product = await createProduct('Option In Use Shirt')
  await variantService.generateVariants(product.id, { Size: ['S', 'M'], Color: ['Red'] })
  const [size] = await optionService.list(product.id)

  // The variants would be left with the same options
  await expect(optionService.delete(size.id)).rejects.toThrow(
    'Size has more than one value in use; delete its values until one is left',
  )
  await optionService.deleteValue(size.values.find((v) => v.value === 'M')!.id)
  await optionService.delete(size.id)
  expect((await variantService.list(product.id)).map((v) => v.options)).toEqual([[{ name: 'Color', value: 'Red' }]])
})

test('should link a variant to an image of its own product only', async () => {
  const product = await createProduct('Image Shirt')
  const [front, back] = await imageService.setImages(product.id, [
    'https://example.com/front.jpg',
    'https://example.com/back.jpg',
  ])
  await variantService.update(product.variants[0].id, { imageId: back.id })

  // Replacing the images keeps the link while the URL is still there
  await imageService.setImages(product.id, [
    'https://example.com/back.jpg',
    'https://example.com/side.jpg',
  ])
  expect((await variantService.get(product.variants[0].id))!.image!.imageUrl).toBe(
    'https://example.com/back.jpg',
  )
  await imageService.setImages(product.id, ['https://example.com/side.jpg'])
  expect((await variantService.get(product.variants[0].id))!.image).toBeNull()

  const other = await createProduct('Other Image Shirt')
  await expect(
    variantService.update(other.variants[0].id, { imageId: front.id }),
  ).rejects.toThrow(`Image does not belong to the product: ${front.id}`)
})

test('should filter and sort products by the lowest active variant price', async () => {
  const cheap = await createProduct('Lowest Price Cheap', '30')
  await variantService.update(cheap.variants[0].id, { discountedPrice: '20' })
  const dear = await createProduct('Lowest Price Dear', '50')
  await variantService.update(dear.variants[0].id, { options: { Size: 'M' } })
  await variantService.create(dear.id, {
    sku: 'lowest-price-dear-inactive',
    price: '5',
    isActive: false,
    options: { Size: 'S' },
  })

  const list = async (filter: Parameters<ProductService['list']>[0]) =>
    (await productService.list({ q: 'Lowest Price', ...filter })) as Array<{
      id: number
      minPrice: string | null
    }>

  expect(
    (await list({ sortBy: 'priceAsc' })).map((p) => [p.id, Number(p.minPrice)]),
  ).toEqual([
    [cheap.id, 20],
    [dear.id, 50],
  ])
  expect((await list({ sortBy: 'priceDesc' })).map((p) => p.id)).toEqual([
    dear.id,
    cheap.id,
  ])
  expect((await list({ minPrice: 25 })).map((p) => p.id)).toEqual([dear.id])
  expect((await list({ maxPrice: 25 })).map((p) => p.id)).toEqual([cheap.id])
})
