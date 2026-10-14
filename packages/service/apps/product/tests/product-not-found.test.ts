import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError } from 'core/errors'
import {
  BrandService,
  CategoryService,
  ProductClassService,
  ProductOptionService,
  ProductService,
  ProductVariantService,
} from 'apps/product/services/product'

const missing = 999999

test.each([
  ['product update', () => new ProductService(db).update(missing, { name: 'x', images: ['a.jpg'] }), 'Product not found: 999999'],
  ['product delete', () => new ProductService(db).delete(missing), 'Product not found: 999999'],
  ['variant delete', () => new ProductVariantService(db).delete(missing), 'Product variant not found: 999999'],
  ['brand update', () => new BrandService(db).update(missing, { name: 'x' }), 'Brand not found: 999999'],
  ['brand delete', () => new BrandService(db).delete(missing), 'Brand not found: 999999'],
  ['category update', () => new CategoryService(db).update(missing, { name: 'x' }), 'Category not found: 999999'],
  ['category delete', () => new CategoryService(db).delete(missing), 'Category not found: 999999'],
  ['product class update', () => new ProductClassService(db).update(missing, { name: 'x' }), 'Product class not found: 999999'],
  ['product class delete', () => new ProductClassService(db).delete(missing), 'Product class not found: 999999'],
  ['option rename', () => new ProductOptionService(db).rename(missing, 'x'), 'Product option not found: 999999'],
  ['option delete', () => new ProductOptionService(db).delete(missing), 'Product option not found: 999999'],
  ['option value rename', () => new ProductOptionService(db).renameValue(missing, 'x'), 'Product option value not found: 999999'],
  ['option value delete', () => new ProductOptionService(db).deleteValue(missing), 'Product option value not found: 999999'],
])('%s throws NotFoundError for a missing record', async (_, call, message) => {
  const error = await call().then(() => undefined, (e) => e)

  expect(error).toBeInstanceOf(NotFoundError)
  expect(error.message).toBe(message)
})
