import { createPage } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import {
  BrandService,
  CategoryService,
  ProductService,
  ProductVariantService,
  RelatedProductService,
} from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { setupStorefront, url } from './helpers'

describe.skipIf(!url)('browsing', async () => {
  const db = await setupStorefront()
  // Prices below are checked as US dollars
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const products = new ProductService(db)

  const product = (name: string, fields: Record<string, unknown> = {}) =>
    products.create({ name, slug: unique(name.toLowerCase().replaceAll(' ', '-')), sku: unique('sku'), price: '10', stockQuantity: 10, status: 'Published', ...fields })

  const names = (page: Awaited<ReturnType<typeof createPage>>) => page.locator('[data-product-card] h3').allTextContents()

  test('the home page shows shop by category, featured products and best sellers', async () => {
    const category = await new CategoryService(db).create({ name: unique('Ceramics'), slug: unique('ceramics') })
    const featured = await product(unique('Featured Mug'), { isFeatured: true, categoryId: category.id })
    const best = await product(unique('Best Bowl'), { isBestSeller: true })
    const page = await createPage('/')

    await page.getByRole('region', { name: 'Shop by category' }).getByRole('link', { name: category.name }).waitFor()
    await page.getByRole('region', { name: 'Featured' }).getByText(featured.name).waitFor()
    await page.getByRole('region', { name: 'Best sellers' }).getByText(best.name).waitFor()
    expect(await page.getByRole('region', { name: 'Featured' }).getByText(best.name).count()).toBe(0)
  })

  test('a category lists its products and its subcategories, sorted and paged in the URL', async () => {
    const categories = new CategoryService(db)
    const parent = await categories.create({ name: unique('Kitchen'), slug: unique('kitchen'), description: 'Tools for cooking.' })
    const child = await categories.create({ name: unique('Knives'), slug: unique('knives'), parentId: parent.id })
    const prefix = unique('Item')
    for (const [i, price] of ['30', '10', '20'].entries()) {
      await product(`${prefix} ${i}`, { price, categoryId: i === 2 ? child.id : parent.id })
    }
    const page = await createPage(`/categories/${parent.slug}`)

    await page.getByRole('heading', { level: 1, name: parent.name }).waitFor()
    await page.getByText('Tools for cooking.').waitFor()
    await page.getByRole('link', { name: child.name }).waitFor()
    expect(await page.title()).toMatch(new RegExp(`^${parent.name} · `))
    expect((await names(page)).sort()).toEqual([`${prefix} 0`, `${prefix} 1`, `${prefix} 2`])

    await page.getByLabel('Sort by').click()
    await page.getByRole('option', { name: 'Price, low to high' }).click()
    await page.waitForURL('**sort=priceAsc**')
    await expect.poll(() => names(page)).toEqual([`${prefix} 1`, `${prefix} 2`, `${prefix} 0`])

    await page.goto(`${process.env.BETTER_AUTH_URL}/categories/${parent.slug}?sort=priceAsc&size=2&page=2`)
    await expect.poll(() => names(page)).toEqual([`${prefix} 0`])
  })

  test('filters by brand and price in the URL', async () => {
    const category = await new CategoryService(db).create({ name: unique('Bags'), slug: unique('bags') })
    const brand = await new BrandService(db).create({ name: unique('Northwind'), slug: unique('northwind') })
    const prefix = unique('Bag')
    await product(`${prefix} cheap`, { price: '15', categoryId: category.id, brandId: brand.id })
    await product(`${prefix} dear`, { price: '90', categoryId: category.id, brandId: brand.id })
    await product(`${prefix} other`, { price: '20', categoryId: category.id })
    const page = await createPage(`/categories/${category.slug}`)

    await page.getByRole('checkbox', { name: brand.name }).click()
    await page.waitForURL(`**brands=${brand.id}**`)
    await expect.poll(async () => (await names(page)).sort()).toEqual([`${prefix} cheap`, `${prefix} dear`])

    await page.getByLabel('Highest price').fill('50')
    await page.getByLabel('Highest price').press('Enter')
    await page.waitForURL('**maxPrice=50**')
    await expect.poll(() => names(page)).toEqual([`${prefix} cheap`])
  })

  test('a brand page and search list their products; unknown pages give 404', async () => {
    const brand = await new BrandService(db).create({ name: unique('Acme'), slug: unique('acme') })
    const word = unique('zebra')
    const branded = await product(`${word} lamp`, { brandId: brand.id })
    const page = await createPage(`/brands/${brand.slug}`)
    await page.getByRole('heading', { level: 1, name: brand.name }).waitFor()
    expect(await names(page)).toEqual([branded.name])

    await page.goto(`${process.env.BETTER_AUTH_URL}/search?q=${word}`)
    await page.getByRole('heading', { level: 1, name: `Results for “${word}”` }).waitFor()
    expect(await names(page)).toEqual([branded.name])
    await page.goto(`${process.env.BETTER_AUTH_URL}/search?q=${unique('nothing')}`)
    await page.getByText('No products match').waitFor()

    const missing = await page.goto(`${process.env.BETTER_AUTH_URL}/categories/${unique('missing')}`)
    expect(missing?.status()).toBe(404)
    expect((await page.goto(`${process.env.BETTER_AUTH_URL}/products/${unique('missing')}`))?.status()).toBe(404)
  })

  test('the product page picks variants by option, shows stock and adds to the cart', async () => {
    const tee = await product(unique('Tee'), {
      price: '25',
      description: '<p>Heavy <strong>cotton</strong> tee.</p>',
      customFields: [{ label: 'Monogram', required: true, maxLength: 3 }],
    })
    const variants = new ProductVariantService(db)
    await variants.generateVariants(tee.id, { Size: ['S', 'M', 'L'] })
    const all = await variants.list(tee.id)
    const bySize = Object.fromEntries(all.map((v) => [v.options[0]!.value, v]))
    await variants.update(bySize.S!.id, { stockQuantity: 5 })
    await variants.update(bySize.M!.id, { stockQuantity: 2, price: '30' })
    // L stays at 0: sold out
    const page = await createPage(`/products/${tee.slug}`)

    await page.getByRole('heading', { level: 1, name: tee.name }).waitFor()
    await page.getByText('Heavy cotton tee.').waitFor()
    await page.getByRole('radio', { name: 'M', exact: true }).click()
    await page.waitForURL(`**variant=${bySize.M!.id}`)
    await page.getByTestId('price').getByText('$30.00').waitFor()
    await page.getByText('Only 2 left').waitFor()

    await page.getByRole('radio', { name: 'L, sold out' }).click()
    expect(await page.getByRole('button', { name: 'Sold out' }).isDisabled()).toBe(true)

    await page.getByRole('radio', { name: 'S', exact: true }).click()
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await page.getByText('Enter Monogram').waitFor()
    await page.getByLabel('Monogram').fill('ABC')
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await page.getByRole('dialog', { name: 'Your cart (1)' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Cart, 1 item' }).waitFor()
  })

  test('the product page has its SEO tags, JSON-LD and related products', async () => {
    const related = await product(unique('Saucer'))
    const cup = await product(unique('Cup'), { price: '18', description: '<p>A stoneware cup for coffee.</p>', thumbnail: 'https://example.com/cup.jpg' })
    await new RelatedProductService(db).setRelatedProducts(cup.id, [related.id])
    const page = await createPage(`/products/${cup.slug}`)

    await page.getByRole('region', { name: 'You may also like' }).getByText(related.name).waitFor()
    expect(await page.title()).toMatch(new RegExp(`^${cup.name} · `))
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBe('A stoneware cup for coffee.')
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe('https://example.com/cup.jpg')
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    expect(jsonLd).toMatchObject({
      '@type': 'Product',
      name: cup.name,
      offers: { '@type': 'Offer', price: '18', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    })
  })
})
