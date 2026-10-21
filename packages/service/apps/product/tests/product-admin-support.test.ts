import { expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError, ValidationError } from 'core/errors'
import { ProductService, ProductVariantService } from 'apps/product/services/product'

const productService = new ProductService(db)
const variantService = new ProductVariantService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createProduct = (prefix: string, fields: Record<string, unknown> = {}) => {
  const slug = unique(prefix)
  return productService.create({ name: slug, slug, sku: slug.toUpperCase(), price: '10', stockQuantity: 5, ...fields })
}

test('list rows summarise their variants', async () => {
  const prefix = unique('summary')
  const single = await createProduct(prefix)
  const several = await createProduct(prefix, { price: '20', stockQuantity: 2 })
  await variantService.create(several.id, { sku: unique('SKU'), price: '30', stockQuantity: 4, options: { Size: 'L' } })
  await variantService.create(several.id, { sku: unique('SKU'), price: '99', stockQuantity: 7, isActive: false, options: { Size: 'XL' } })

  const rows = await productService.list({ q: prefix })
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]))

  expect(byId[single.id]).toMatchObject({ variantCount: 1, totalStock: 5 })
  expect(byId[single.id].singleVariant).toMatchObject({ id: single.variants[0].id, stockQuantity: 5 })
  expect(Number(byId[single.id].singleVariant!.price)).toBe(10)
  // Active variants only for prices and stock; all of them for the count
  expect(byId[several.id]).toMatchObject({ variantCount: 3, totalStock: 6, singleVariant: null })
  expect(Number(byId[several.id].minPrice)).toBe(20)
  expect(Number(byId[several.id].maxPrice)).toBe(30)
})

test('list sorts by name and date', async () => {
  const prefix = unique('sorted')
  const b = await createProduct(`${prefix}-b`)
  const a = await createProduct(`${prefix}-a`)
  const c = await createProduct(`${prefix}-c`)
  const ids = async (sortBy: 'nameAsc' | 'nameDesc' | 'newest' | 'oldest' | 'featuredNewest') =>
    (await productService.list({ q: prefix, sortBy })).map((row) => row.id)

  expect(await ids('nameAsc')).toEqual([a.id, b.id, c.id])
  expect(await ids('nameDesc')).toEqual([c.id, b.id, a.id])
  expect(await ids('newest')).toEqual([c.id, a.id, b.id])
  expect(await ids('oldest')).toEqual([b.id, a.id, c.id])
})

test('list sorts featured products first, then newest', async () => {
  const prefix = unique('featured-sort')
  const older = await createProduct(`${prefix}-older`)
  const featuredOlder = await createProduct(`${prefix}-featured-older`, { isFeatured: true })
  const newer = await createProduct(`${prefix}-newer`)
  const featuredNewer = await createProduct(`${prefix}-featured-newer`, { isFeatured: true })

  expect((await productService.list({ q: prefix, sortBy: 'featuredNewest' })).map((row) => row.id)).toEqual([
    featuredNewer.id,
    featuredOlder.id,
    newer.id,
    older.id,
  ])
})

test('updateMany changes several products at once, or none', async () => {
  const first = await createProduct('bulk')
  const second = await createProduct('bulk')

  const updated = await productService.updateMany([first.id, second.id], { status: 'Published', isFeatured: true })

  expect(updated.map((p) => p.id).sort()).toEqual([first.id, second.id].sort())
  expect(updated.every((p) => p.status === 'Published' && p.isFeatured)).toBe(true)

  await expect(productService.updateMany([first.id, 999999], { isActive: false })).rejects.toThrow(
    new NotFoundError('Product not found: 999999'),
  )
  expect((await productService.get(first.id))?.isActive).toBe(true)
})

test('generateVariants creates every missing combination', async () => {
  const product = await createProduct('generate', { price: '25', discountedPrice: '20', inventoryCost: '9' })

  const variants = await variantService.generateVariants(product.id, {
    Size: ['S', 'M'],
    Colour: ['Red', 'Dark Blue'],
  })

  const detail = await productService.get(product.id)
  const combos = detail!.variants.map((v) => v.options.map((o) => `${o.name}=${o.value}`).join(' '))
  expect(combos.sort()).toEqual([
    'Size=M Colour=Dark Blue',
    'Size=M Colour=Red',
    'Size=S Colour=Dark Blue',
    'Size=S Colour=Red',
  ].sort())
  // The option-less first variant took the first combination and kept its id
  expect(variants.map((v) => v.id)).toContain(product.variants[0].id)
  const added = detail!.variants.find((v) => v.id !== product.variants[0].id)!
  expect(added).toMatchObject({ stockQuantity: 0 })
  expect(Number(added.price)).toBe(25)
  expect(Number(added.discountedPrice)).toBe(20)
  expect(added.sku.startsWith(`${product.variants[0].sku}-`)).toBe(true)

  // Running it again with a new value only adds what is missing
  await variantService.generateVariants(product.id, { Size: ['S', 'M', 'L'], Colour: ['Red', 'Dark Blue'] })
  expect((await productService.get(product.id))!.variants).toHaveLength(6)
})

test('generateVariants refuses empty options and too many combinations', async () => {
  const product = await createProduct('generate-bad')

  await expect(variantService.generateVariants(product.id, {})).rejects.toThrow(
    new ValidationError('Give at least one option with values'),
  )
  await expect(variantService.generateVariants(product.id, { Size: [] })).rejects.toThrow(
    new ValidationError('Give at least one value for Size'),
  )
  const many = Array.from({ length: 11 }, (_, i) => `v${i}`)
  await expect(variantService.generateVariants(product.id, { A: many, B: many })).rejects.toThrow(
    new ValidationError('Too many combinations: 121 (at most 100)'),
  )
  await expect(variantService.generateVariants(999999, { Size: ['S'] })).rejects.toThrow(
    new NotFoundError('Product not found: 999999'),
  )
})
