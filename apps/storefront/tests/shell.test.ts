import { createPage } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import { CategoryService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { setupStorefront, signedInPage, url } from './helpers'

describe.skipIf(!url)('storefront shell', async () => {
  const db = await setupStorefront()
  const base = () => process.env.BETTER_AUTH_URL!
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`

  const product = (fields: Record<string, unknown> = {}) => {
    const slug = unique('product')
    return new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 10, status: 'Published', ...fields })
  }

  test('shows the store name, the hero and the SEO defaults', async () => {
    await new StoreSettingsService(db).updateSettings({ name: 'Linen & Oak', locale: 'en-GB' })
    const page = await createPage('/')

    await page.getByRole('banner').getByText('Linen & Oak').waitFor()
    await page.getByRole('heading', { level: 1, name: 'Made to be used, every day' }).waitFor()
    expect(await page.title()).toBe('Linen & Oak')
    expect(await page.locator('html').getAttribute('lang')).toBe('en-GB')
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(/^Shop considered goods/)
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${base()}/`)
    expect(await page.locator('meta[property="og:site_name"]').getAttribute('content')).toBe('Linen & Oak')
  })

  test('the category menu lists categories with products, and their subcategories', async () => {
    const categories = new CategoryService(db)
    const parent = await categories.create({ name: unique('Clothing'), slug: unique('clothing') })
    const child = await categories.create({ name: unique('Shirts'), slug: unique('shirts'), parentId: parent.id })
    const empty = await categories.create({ name: unique('Empty'), slug: unique('empty') })
    await product({ categoryId: child.id })
    const page = await createPage('/')
    const menu = page.getByRole('navigation', { name: 'Categories' }).first()

    await menu.getByText(parent.name).hover()
    await page.getByRole('link', { name: child.name }).waitFor()
    expect(await page.getByRole('link', { name: child.name }).getAttribute('href')).toBe(`/categories/${child.slug}`)
    expect(await menu.getByText(empty.name).count()).toBe(0)
    // The footer lists the top-level ones
    expect(await page.getByRole('contentinfo').getByRole('link', { name: parent.name }).getAttribute('href')).toBe(`/categories/${parent.slug}`)
  })

  test('search opens from the header and goes to the results page', async () => {
    const page = await createPage('/')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('textbox', { name: 'Search products' }).fill('linen shirt')
    await page.keyboard.press('Enter')
    await page.waitForURL('**/search?q=linen+shirt')
  })

  test('the cart button shows how many items the cart holds', async () => {
    const { variants } = await product()
    const page = await createPage('/')
    expect(await page.getByRole('button', { name: 'Cart', exact: true }).count()).toBe(1)

    await page.evaluate(async (variantId) => {
      await fetch('/api/store/cart/lines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ variantId, quantity: 2 }),
      })
    }, variants[0]!.id)
    await page.reload()
    await page.getByRole('button', { name: 'Cart, 2 items' }).waitFor()
  })

  test('signed out shows Sign in; signed in shows the account menu', async () => {
    const guest = await createPage('/')
    expect(await guest.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    await guest.goto(`${base()}/cart`)
    expect(await guest.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login?redirect=/cart')

    const email = `${unique('ann')}@example.com`
    const page = await signedInPage(db, email)
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByText(email).waitFor()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('link', { name: 'Sign in' }).waitFor()
  })

  test('small screens get the category menu in a drawer', async () => {
    const category = await new CategoryService(db).create({ name: unique('Bags'), slug: unique('bags') })
    await product({ categoryId: category.id })
    const page = await createPage('/')
    await page.setViewportSize({ width: 390, height: 800 })

    await page.getByRole('button', { name: /menu/i }).click()
    await page.getByRole('dialog').getByRole('link', { name: category.name }).waitFor()
  })
})
