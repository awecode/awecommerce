import { describe, expect, test } from 'vitest'
import {
  BrandService,
  CategoryService,
  ProductService,
  ProductVariantService,
  RelatedProductService,
} from '@awecommerce/service/apps/product/services/product'
import { OfferService } from '@awecommerce/service/apps/offer/services/offer'
import type { NewProduct } from '@awecommerce/service/apps/product/schemas'
import { buyer, setupApi, unique, url } from './helpers'

describe.skipIf(!url)('store catalog API', async () => {
  const db = await setupApi()
  const request = buyer()

  // Every product in a test shares a name prefix, so `q` keeps the test to its own
  const createProduct = async (prefix: string, fields: Partial<NewProduct> = {}) => {
    const slug = unique(prefix)
    return await new ProductService(db).create({
      stockQuantity: 1000,
      name: slug,
      slug,
      sku: slug,
      price: '10',
      inventoryCost: '4',
      status: 'Published',
      ...fields,
    })
  }
  const names = (body: any) => body.results.map((p: any) => p.name)

  test('lists only active, published products', async () => {
    const prefix = unique('visible')
    const listed = await createProduct(prefix)
    await createProduct(prefix, { status: 'Draft' })
    await createProduct(prefix, { isActive: false })
    const hiddenBrand = await new BrandService(db).create({ name: unique('b'), slug: unique('b'), isActive: false })
    await createProduct(prefix, { brandId: hiddenBrand.id })

    const { body } = await request(`/api/store/products?q=${prefix}`)

    expect(names(body)).toEqual([listed.name])
    expect(body.results[0]).not.toHaveProperty('inventoryCost')
  })

  test('filters by category, brand, price and flags, and sorts by price', async () => {
    const prefix = unique('filter')
    const category = await new CategoryService(db).create({ name: unique('c'), slug: unique('c') })
    const brand = await new BrandService(db).create({ name: unique('b'), slug: unique('b') })
    const cheap = await createProduct(prefix, { price: '5', categoryId: category.id })
    const mid = await createProduct(prefix, { price: '20', categoryId: category.id, brandId: brand.id, isFeatured: true })
    const dear = await createProduct(prefix, { price: '50', brandId: brand.id, isBestSeller: true })
    const list = async (query: string) => names((await request(`/api/store/products?q=${prefix}&${query}`)).body)

    expect(await list(`categories=${category.id}`)).toEqual([mid.name, cheap.name])
    expect(await list(`brands=${brand.id}&sortBy=priceAsc`)).toEqual([mid.name, dear.name])
    expect(await list(`categories=${category.id}&brands=${brand.id}`)).toEqual([mid.name])
    expect(await list('minPrice=10&maxPrice=30')).toEqual([mid.name])
    expect(await list('featured=true')).toEqual([mid.name])
    expect(await list('bestSeller=true')).toEqual([dear.name])
    expect(await list('sortBy=priceDesc')).toEqual([dear.name, mid.name, cheap.name])
    // Featured first, then newest (mid is featured; dear is newer than cheap)
    expect(await list('sortBy=featuredNewest')).toEqual([mid.name, dear.name, cheap.name])
    // Several ids, comma-separated or repeated
    const other = await new CategoryService(db).create({ name: unique('c'), slug: unique('c') })
    const inOther = await createProduct(prefix, { price: '1', categoryId: other.id })
    expect(await list(`categories=${category.id},${other.id}&sortBy=priceAsc`)).toEqual([inOther.name, cheap.name, mid.name])
    expect(await list(`categories=${category.id}&categories=${other.id}&sortBy=priceAsc`)).toEqual([inOther.name, cheap.name, mid.name])
  })

  test('a category filter includes its subcategories, and inactive branches are hidden', async () => {
    const prefix = unique('tree')
    const categoryService = new CategoryService(db)
    const clothing = await categoryService.create({ name: unique('clothing'), slug: unique('clothing') })
    const shirts = await categoryService.create({ name: unique('shirts'), slug: unique('shirts'), parentId: clothing.id })
    const formal = await categoryService.create({ name: unique('formal'), slug: unique('formal'), parentId: shirts.id })
    const inClothing = await createProduct(prefix, { categoryId: clothing.id })
    const inShirts = await createProduct(prefix, { categoryId: shirts.id })
    const inFormal = await createProduct(prefix, { categoryId: formal.id })
    const list = async () =>
      names((await request(`/api/store/products?q=${prefix}&categories=${clothing.id}`)).body).sort()

    expect(await list()).toEqual([inClothing.name, inShirts.name, inFormal.name].sort())

    await categoryService.update(shirts.id, { isActive: false })
    expect(await list()).toEqual([inClothing.name])
    const categoryIds = (await request('/api/store/categories')).body.map((c: any) => c.id)
    expect(categoryIds).toContain(clothing.id)
    expect(categoryIds).not.toContain(shirts.id)
    expect(categoryIds).not.toContain(formal.id)
  })

  test('paginates, up to 100 a page', async () => {
    const prefix = unique('page')
    for (let i = 0; i < 3; i++) await createProduct(prefix)

    const { body } = await request(`/api/store/products?q=${prefix}&page=2&size=2`)
    expect(body.results).toHaveLength(1)
    expect(body.pagination).toEqual({ page: 2, size: 2, total: 3, pages: 2 })
    expect((await request('/api/store/products?size=101')).status).toBe(400)
    expect((await request('/api/store/products?sortBy=name')).status).toBe(400)
    expect((await request('/api/store/products?categories=abc')).status).toBe(400)
  })

  test('shows a product without its cost, inactive variants or hidden related products', async () => {
    const prefix = unique('detail')
    const product = await createProduct(prefix)
    const variantService = new ProductVariantService(db)
    await variantService.create(product.id, {
      sku: unique('sku'),
      price: '12',
      inventoryCost: '5',
      isActive: false,
      options: { Size: 'L' },
    })
    const related = await createProduct(prefix)
    const draft = await createProduct(prefix, { status: 'Draft' })
    await new RelatedProductService(db).setRelatedProducts(product.id, [related.id, draft.id])

    const { status, body } = await request(`/api/store/products/${product.slug}`)

    expect(status).toBe(200)
    expect(body.variants.map((v: any) => v.id)).toEqual([product.variants[0]!.id])
    expect(body.variants[0]).not.toHaveProperty('inventoryCost')
    expect(Number(body.variants[0].price)).toBe(10)
    expect(body.relatedProducts.map((p: any) => p.id)).toEqual([related.id])
    expect((await request(`/api/store/products/${draft.slug}`)).status).toBe(404)
  })

  test('says which products and variants are in stock', async () => {
    const prefix = unique('stock')
    const product = await createProduct(prefix, { stockQuantity: 0 })
    const variantService = new ProductVariantService(db)
    await variantService.update(product.variants[0]!.id, { options: { Size: 'S' } })
    await variantService.create(product.id, { sku: unique('sku'), price: '10', stockQuantity: 3, options: { Size: 'M' } })
    const soldOut = await createProduct(prefix, { stockQuantity: 0 })

    const detail = (await request(`/api/store/products/${product.slug}`)).body
    expect(detail.variants.map((v: any) => [v.options[0].value, v.inStock])).toEqual([['S', false], ['M', true]])
    const list = (await request(`/api/store/products?q=${prefix}`)).body.results
    const inStock = Object.fromEntries(list.map((p: any) => [p.id, p.inStock]))
    expect([inStock[product.id], inStock[soldOut.id]]).toEqual([true, false])
  })

  test('the product page follows the same rule as the list', async () => {
    const prefix = unique('page-rule')
    const brand = await new BrandService(db).create({ name: unique('b'), slug: unique('b') })
    const parent = await new CategoryService(db).create({ name: unique('c'), slug: unique('c') })
    const child = await new CategoryService(db).create({ name: unique('c'), slug: unique('c'), parentId: parent.id })
    const product = await createProduct(prefix)
    const branded = await createProduct(prefix, { brandId: brand.id })
    const inChild = await createProduct(prefix, { categoryId: child.id })
    await new RelatedProductService(db).setRelatedProducts(product.id, [branded.id, inChild.id])

    await new BrandService(db).markAsInactive(brand.id)
    await new CategoryService(db).update(parent.id, { isActive: false })

    expect((await request(`/api/store/products/${branded.slug}`)).status).toBe(404)
    expect((await request(`/api/store/products/${inChild.slug}`)).status).toBe(404)
    expect((await request(`/api/store/products/${product.slug}`)).body.relatedProducts).toEqual([])
  })

  test('menus list only categories and brands with listed products', async () => {
    const categoryService = new CategoryService(db)
    const parent = await categoryService.create({ name: unique('parent'), slug: unique('parent') })
    const child = await categoryService.create({ name: unique('child'), slug: unique('child'), parentId: parent.id })
    const hidden = await categoryService.create({ name: unique('hidden'), slug: unique('hidden'), isActive: false })
    const brandService = new BrandService(db)
    const stocked = await brandService.create({ name: unique('stocked'), slug: unique('stocked') })
    const empty = await brandService.create({ name: unique('empty'), slug: unique('empty') })
    const draftOnly = await brandService.create({ name: unique('draft'), slug: unique('draft') })
    const emptyCategory = await categoryService.create({ name: unique('empty'), slug: unique('empty') })
    await createProduct(unique('brand'), { brandId: stocked.id, categoryId: child.id })
    await createProduct(unique('brand'), { brandId: draftOnly.id, status: 'Draft' })

    const categories = (await request('/api/store/categories')).body
    const ids = categories.map((c: any) => c.id)
    expect(ids).toEqual(expect.arrayContaining([parent.id, child.id]))
    expect(ids).not.toContain(hidden.id)
    expect(ids).not.toContain(emptyCategory.id)
    expect(categories.find((c: any) => c.id === child.id).parent.id).toBe(parent.id)
    // With what the home page uses
    expect(categories.find((c: any) => c.id === child.id)).toMatchObject({ isFeatured: false, order: 1 })

    const brandIds = (await request('/api/store/brands')).body.map((b: any) => b.id)
    expect(brandIds).toContain(stocked.id)
    expect(brandIds).not.toContain(empty.id)
    expect(brandIds).not.toContain(draftOnly.id)
  })

  test('the home page returns best sellers, brands and a featured category shelf', async () => {
    const category = await new CategoryService(db).create({ name: unique('home-cat'), slug: unique('home-cat'), isFeatured: true })
    const brand = await new BrandService(db).create({ name: unique('home-brand'), slug: unique('home-brand') })
    const best = await createProduct(unique('home-best'), { isBestSeller: true, categoryId: category.id, brandId: brand.id })
    const { status, body } = await request('/api/store/home')
    expect(status).toBe(200)
    expect(body.bestSellers.map((product: { id: number }) => product.id)).toContain(best.id)
    expect(body.brands.map((row: { id: number }) => row.id)).toContain(brand.id)
    const shelf = body.categories.find((row: { category: { id: number } }) => row.category.id === category.id)
    expect(shelf?.category).toEqual({ id: category.id, name: category.name, slug: category.slug })
    expect(shelf?.products.map((product: { id: number }) => product.id)).toContain(best.id)
    expect(body.offers).toEqual(expect.any(Array))
    expect(body.membershipPlans).toEqual(expect.any(Array))
  })

  test('lists the featured offers anyone can use, without their targeting', async () => {
    const offers = new OfferService(db)
    const parts = {
      products: { all: true },
      condition: { type: 'basket_quantity' as const, value: '1' },
      benefit: { type: 'percentage' as const, value: '10' },
      isFeatured: true,
    }
    const voucher = await offers.createWithParts({ ...parts, name: unique('Welcome'), type: 'voucher', voucherCode: unique('WELCOME'), includeAllUsers: true, description: 'Your first order' })
    const private_ = await offers.createWithParts({ ...parts, name: unique('Mine'), type: 'voucher', voucherCode: unique('MINE'), includedUserIds: ['someone'] })

    const { body } = await request('/api/store/offers')
    expect(body.find((offer: any) => offer.id === voucher.id)).toEqual({
      id: voucher.id,
      name: voucher.name,
      description: 'Your first order',
      image: null,
      type: 'voucher',
      voucherCode: voucher.voucherCode,
      endDate: null,
      benefit: { type: 'percentage', value: expect.any(String) },
      condition: { type: 'basket_quantity', value: expect.any(String) },
    })
    expect(body.map((offer: any) => offer.id)).not.toContain(private_.id)
  })

  test('the cart summary does not show variant costs', async () => {
    const cartBuyer = buyer()
    const product = await createProduct(unique('cost'))
    const { body } = await cartBuyer('/api/store/cart/lines', {
      method: 'POST',
      body: { variantId: product.variants[0]!.id, quantity: 1 },
    })
    expect(body.lines[0].variant.sku).toBe(product.variants[0]!.sku)
    expect(body.lines[0].variant).not.toHaveProperty('inventoryCost')
  })
})
