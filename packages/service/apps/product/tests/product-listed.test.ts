import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { OrderService } from 'apps/order/services/order'
import {
  BrandService,
  CategoryService,
  ProductClassService,
  ProductService,
} from 'apps/product/services/product'
import type { NewProduct } from 'apps/product/schemas'

const productService = new ProductService(db)
const brandService = new BrandService(db)
const categoryService = new CategoryService(db)
const productClassService = new ProductClassService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

const createProduct = (prefix: string, fields: Partial<NewProduct> = {}) => {
  const slug = unique(prefix)
  return productService.create({
    stockQuantity: 1000,
    name: slug,
    slug,
    sku: slug,
    price: '10',
    status: 'Published',
    ...fields,
  })
}

// One listed product, and one product hidden for each reason
const createProducts = async (prefix: string) => {
  const hiddenBrand = await brandService.create({ name: unique('b'), slug: unique('b'), isActive: false })
  const hiddenClass = await productClassService.create({ name: unique('pc'), slug: unique('pc'), isActive: false })
  const hiddenParent = await categoryService.create({ name: unique('c'), slug: unique('c'), isActive: false })
  const child = await categoryService.create({ name: unique('c'), slug: unique('c'), parentId: hiddenParent.id })
  return {
    listed: await createProduct(prefix),
    hidden: [
      await createProduct(prefix, { status: 'Draft' }),
      await createProduct(prefix, { isActive: false }),
      await createProduct(prefix, { brandId: hiddenBrand.id }),
      await createProduct(prefix, { productClassId: hiddenClass.id }),
      await createProduct(prefix, { categoryId: child.id }),
    ],
  }
}

test('listedProductIds keeps only products the store shows', async () => {
  const { listed, hidden } = await createProducts(unique('listed-ids'))

  const ids = await productService.listedProductIds([listed.id, ...hidden.map((p) => p.id), 999999])

  expect(ids).toEqual([listed.id])
  expect(await productService.listedProductIds([])).toEqual([])
})

test('getListedBySlug loads a listed product like get, and nothing for hidden ones', async () => {
  const { listed, hidden } = await createProducts(unique('listed-slug'))

  expect(await productService.getListedBySlug(listed.slug)).toEqual(await productService.get(listed.id))
  for (const product of hidden) {
    expect(await productService.getListedBySlug(product.slug)).toBeNull()
  }
  expect(await productService.getListedBySlug('no-such-product')).toBeNull()
})

test('a page of the list carries the total, also past the end and with a price filter', async () => {
  const prefix = unique('listed-pages')
  for (const price of ['10', '20', '30']) await createProduct(prefix, { price })
  const page = (page: number, extra = {}) =>
    productService.list({ q: prefix, listedOnly: true, pagination: { page, size: 2 }, ...extra })

  const first = await page(1)
  expect(first.results).toHaveLength(2)
  expect(first.pagination).toEqual({ page: 1, size: 2, total: 3, pages: 2 })
  expect((await page(2)).results).toHaveLength(1)
  expect(await page(3)).toEqual({ results: [], pagination: { page: 3, size: 2, total: 3, pages: 2 } })
  const cheap = await page(1, { maxPrice: 20 })
  expect(cheap.results.map((p) => p.minPrice).map(Number).sort()).toEqual([10, 20])
  expect(cheap.pagination.total).toBe(2)
  expect((await page(1, { q: unique('nothing') })).pagination.total).toBe(0)
})

test('list with listedOnly applies the same rule', async () => {
  const prefix = unique('listed-only')
  const { listed } = await createProducts(prefix)

  const rows = await productService.list({ q: prefix, listedOnly: true, includeInactiveBrands: true })

  expect(rows.map((p) => p.id)).toEqual([listed.id])
})

test('addToCart refuses products that are not listed', async () => {
  const { listed, hidden } = await createProducts(unique('listed-cart'))
  const cartService = new CartService(db)
  const cart = await cartService.create()

  await cartService.addToCart(cart.id, listed.variants[0].id, 1)
  for (const product of hidden) {
    await expect(cartService.addToCart(cart.id, product.variants[0].id, 1)).rejects.toThrow(
      `Product variant is not available: ${product.variants[0].id}`,
    )
  }
})

test('createFromCart refuses a product hidden after it was added', async () => {
  const brand = await brandService.create({ name: unique('b'), slug: unique('b') })
  const product = await createProduct(unique('listed-checkout'), { brandId: brand.id })
  const cartService = new CartService(db)
  const cart = await cartService.create('listed-user')
  await cartService.addToCart(cart.id, product.variants[0].id, 1)
  await brandService.markAsInactive(brand.id)

  await expect(new OrderService(db).createFromCart(cart.id)).rejects.toThrow(
    `Product variant is not available: ${product.variants[0].sku}`,
  )
})

test('hasListedProducts keeps brands with a listed product', async () => {
  const listedBrand = await brandService.create({ name: unique('b'), slug: unique('b') })
  const draftBrand = await brandService.create({ name: unique('b'), slug: unique('b') })
  const hiddenCategoryBrand = await brandService.create({ name: unique('b'), slug: unique('b') })
  const emptyBrand = await brandService.create({ name: unique('b'), slug: unique('b') })
  const hiddenCategory = await categoryService.create({ name: unique('c'), slug: unique('c'), isActive: false })
  await createProduct(unique('brand-menu'), { brandId: listedBrand.id })
  await createProduct(unique('brand-menu'), { brandId: draftBrand.id, status: 'Draft' })
  await createProduct(unique('brand-menu'), { brandId: hiddenCategoryBrand.id, categoryId: hiddenCategory.id })

  const ids = (await brandService.list({ hasListedProducts: true })).map((b) => b.id)

  expect(ids).toContain(listedBrand.id)
  expect(ids).not.toContain(draftBrand.id)
  expect(ids).not.toContain(hiddenCategoryBrand.id)
  expect(ids).not.toContain(emptyBrand.id)
})

test('hasListedProducts keeps categories with a listed product in them or below them', async () => {
  const parent = await categoryService.create({ name: unique('c'), slug: unique('c') })
  const child = await categoryService.create({ name: unique('c'), slug: unique('c'), parentId: parent.id })
  const draftOnly = await categoryService.create({ name: unique('c'), slug: unique('c') })
  const empty = await categoryService.create({ name: unique('c'), slug: unique('c') })
  await createProduct(unique('category-menu'), { categoryId: child.id })
  await createProduct(unique('category-menu'), { categoryId: draftOnly.id, status: 'Draft' })

  const ids = (await categoryService.list({ hasListedProducts: true })).map((c) => c.id)

  expect(ids).toEqual(expect.arrayContaining([parent.id, child.id]))
  expect(ids).not.toContain(draftOnly.id)
  expect(ids).not.toContain(empty.id)
})
