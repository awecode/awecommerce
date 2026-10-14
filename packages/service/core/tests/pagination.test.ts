import { beforeAll, expect, expectTypeOf, test } from 'vitest'

import { db } from 'core/db'
import type { PaginationArgs } from 'core/pagination'
import { BrandService, CategoryService, ProductService } from 'apps/product/services/product'
import { OfferRangeService } from 'apps/offer/services/offer'
import { OrderService } from 'apps/order/services/order'

const productService = new ProductService(db)

beforeAll(async () => {
  for (let i = 1; i <= 3; i++) {
    await productService.create({
      name: `pagination-${i}`,
      slug: `pagination-${i}`,
      sku: `pagination-${i}`,
      price: '10',
    })
  }
})

test('list returns every row without pagination', async () => {
  const products = await productService.list({ isActive: true })

  expectTypeOf(products).toBeArray()
  expect(products.map((p) => p.name).sort()).toEqual(['pagination-1', 'pagination-2', 'pagination-3'])
})

test('list returns one page and the total with pagination', async () => {
  const page = await productService.list({ pagination: { page: 2, size: 2 } })

  expectTypeOf(page.results).toBeArray()
  expectTypeOf(page.pagination.total).toEqualTypeOf<number>()
  expect(page.results).toHaveLength(1)
  expect(page.pagination).toEqual({ page: 2, size: 2, total: 3, pages: 2 })
})

test('list returns either shape when the caller cannot know which', async () => {
  const pagination = undefined as PaginationArgs | undefined
  const result = await productService.list({ pagination })

  // A union of the two: neither part is missing
  expectTypeOf(result).extract<unknown[]>().not.toBeNever()
  expectTypeOf(result).exclude<unknown[]>().toHaveProperty('pagination')
  expect(Array.isArray(result)).toBe(true)
})

test('other lists follow the same rule', async () => {
  const brands = await new BrandService(db).list({})
  const ranges = await new OfferRangeService(db).list({ pagination: { page: 1, size: 5 } })
  const allOrders = await new OrderService(db).list()
  const orderPage = await new OrderService(db).list({ pagination: { page: 1, size: 5 } })

  const categories = await new CategoryService(db).list()

  expectTypeOf(categories).items.not.toBeNever()
  expectTypeOf(categories).items.toHaveProperty('parent')
  expectTypeOf(brands).toBeArray()
  expectTypeOf(ranges.results).toBeArray()
  expectTypeOf(allOrders).toBeArray()
  expectTypeOf(orderPage.pagination.pages).toEqualTypeOf<number>()
  expect(orderPage.pagination.total).toBe(0)
})

test('filters still reject unknown fields', async () => {
  // @ts-expect-error isActiv is not a filter
  await productService.list({ isActiv: true }).catch(() => {})
  // @ts-expect-error isActiv is not a filter, with pagination either
  await productService.list({ isActiv: true, pagination: { page: 1, size: 1 } }).catch(() => {})
})
