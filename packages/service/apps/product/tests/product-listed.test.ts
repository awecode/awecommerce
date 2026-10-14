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
