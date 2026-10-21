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

test('a category cannot be its own parent or sit under its own subcategory', async () => {
  const parent = await createCategory('loop-parent')
  const child = await createCategory('loop-child', parent.id)
  const grandchild = await createCategory('loop-grandchild', child.id)

  await expect(categoryService.update(parent.id, { parentId: parent.id })).rejects.toThrow(
    'A category cannot be its own parent',
  )
  await expect(categoryService.update(parent.id, { parentId: grandchild.id })).rejects.toThrow(
    'A category cannot be under its own subcategory',
  )
  // Moving to an unrelated place still works
  const other = await createCategory('loop-other')
  expect((await categoryService.update(child.id, { parentId: other.id })).parentId).toBe(other.id)
  expect((await categoryService.update(child.id, { parentId: null })).parentId).toBeNull()
})

test('categories list by position, then name, and filter by featured', async () => {
  const later = await categoryService.create({ name: unique('b-ordered'), slug: unique('b-ordered'), order: -5, isFeatured: true })
  const first = await categoryService.create({ name: unique('a-ordered'), slug: unique('a-ordered'), order: -5 })
  const top = await categoryService.create({ name: unique('z-ordered'), slug: unique('z-ordered'), order: -10, isFeatured: true })

  const listed = (await categoryService.list({})).map((c) => c.id).filter((id) => [later.id, first.id, top.id].includes(id))
  expect(listed).toEqual([top.id, first.id, later.id])
  const featured = (await categoryService.list({ isFeatured: true })).map((c) => c.id)
  expect(featured).toEqual(expect.arrayContaining([top.id, later.id]))
  expect(featured).not.toContain(first.id)
})

test('home shelves take products under a category, featured first, up to the limit', async () => {
  const clothing = await categoryService.create({ name: unique('clothing'), slug: unique('clothing'), isFeatured: true })
  const shirts = await createCategory('shirts', clothing.id)
  const other = await categoryService.create({ name: unique('other'), slug: unique('other'), isFeatured: true })
  const listed = async (name: string, categoryId: number, isFeatured = false) => {
    const slug = unique(name)
    return productService.create({ name: slug, slug, sku: slug, price: '10', categoryId, status: 'Published', isFeatured })
  }
  const plain = await listed('plain', shirts.id)
  const featured = await listed('featured', shirts.id, true)
  const elsewhere = await listed('elsewhere', other.id)

  const shelves = await productService.productsForCategories([clothing.id, other.id], 1)
  expect(shelves.get(clothing.id)?.map((product) => product.id)).toEqual([featured.id])
  expect(shelves.get(other.id)?.map((product) => product.id)).toEqual([elsewhere.id])
  expect(shelves.get(clothing.id)?.map((product) => product.id)).not.toContain(plain.id)
})
