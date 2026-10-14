import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { categories } from 'apps/product/schemas'
import { CategoryService, ProductService } from 'apps/product/services/product'

const categoryService = new CategoryService(db)
const productService = new ProductService(db)

let count = 0
const unique = (name: string) => `${name}-${++count}`

const createCategory = (name: string, parentId?: number) =>
  categoryService.create({ name: unique(name), slug: unique(name), parentId })

// Products in a test share a name prefix, so `q` keeps the test to its own
const createProduct = (prefix: string, categoryId: number) => {
  const slug = unique(prefix)
  return productService.create({ name: slug, slug, sku: slug, price: '10', categoryId })
}

const names = (products: { name: string }[]) => products.map((p) => p.name).sort()

// Clothing > Shirts > Formal shirts, and Clothing > Trousers
const createTree = async (prefix: string) => {
  const clothing = await createCategory('clothing')
  const shirts = await createCategory('shirts', clothing.id)
  const formal = await createCategory('formal', shirts.id)
  const trousers = await createCategory('trousers', clothing.id)
  return {
    clothing,
    shirts,
    formal,
    trousers,
    inClothing: await createProduct(prefix, clothing.id),
    inShirts: await createProduct(prefix, shirts.id),
    inFormal: await createProduct(prefix, formal.id),
    inTrousers: await createProduct(prefix, trousers.id),
  }
}

test('includeSubcategories matches the categories and everything under them', async () => {
  const prefix = unique('subcategories')
  const tree = await createTree(prefix)

  const exact = await productService.list({ q: prefix, categories: [tree.clothing.id] })
  const all = await productService.list({
    q: prefix,
    categories: [tree.clothing.id],
    includeSubcategories: true,
  })
  const shirts = await productService.list({
    q: prefix,
    categories: [tree.shirts.id],
    includeSubcategories: true,
  })
  const paged = await productService.list({
    q: prefix,
    categories: [tree.shirts.id, tree.trousers.id],
    includeSubcategories: true,
    pagination: { page: 1, size: 10 },
  })

  expect(names(exact)).toEqual([tree.inClothing.name])
  expect(names(all)).toEqual(
    names([tree.inClothing, tree.inShirts, tree.inFormal, tree.inTrousers]),
  )
  expect(names(shirts)).toEqual(names([tree.inShirts, tree.inFormal]))
  expect(paged.pagination.total).toBe(3)
})

test('hides products anywhere under an inactive category', async () => {
  const prefix = unique('branch')
  const tree = await createTree(prefix)
  await db.update(categories).set({ isActive: false }).where(eq(categories.id, tree.shirts.id))

  const visible = await productService.list({ q: prefix })
  const everything = await productService.list({ q: prefix, includeInactiveCategories: true })

  expect(names(visible)).toEqual(names([tree.inClothing, tree.inTrousers]))
  expect(everything).toHaveLength(4)
})

test("does not loop on categories that are each other's parent", async () => {
  const prefix = unique('cycle')
  const a = await createCategory('a')
  const b = await createCategory('b', a.id)
  await db.update(categories).set({ parentId: b.id }).where(eq(categories.id, a.id))
  const inA = await createProduct(prefix, a.id)
  const inB = await createProduct(prefix, b.id)

  const all = await productService.list({ q: prefix, categories: [a.id], includeSubcategories: true })

  expect(names(all)).toEqual(names([inA, inB]))
})

test('excludeInactiveBranches leaves out categories under an inactive one', async () => {
  const tree = await createTree(unique('category-list'))
  await db.update(categories).set({ isActive: false }).where(eq(categories.id, tree.shirts.id))

  const ownFlag = (await categoryService.list({ isActive: true })).map((c) => c.id)
  const branches = (
    await categoryService.list({ isActive: true, excludeInactiveBranches: true })
  ).map((c) => c.id)

  expect(ownFlag).toEqual(expect.arrayContaining([tree.clothing.id, tree.formal.id, tree.trousers.id]))
  expect(ownFlag).not.toContain(tree.shirts.id)
  expect(branches).toEqual(expect.arrayContaining([tree.clothing.id, tree.trousers.id]))
  expect(branches).not.toContain(tree.shirts.id)
  expect(branches).not.toContain(tree.formal.id)
})
