import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { productVariants } from '@awecommerce/service/apps/product/schemas'
import { CategoryService, ProductService, ProductVariantService } from '@awecommerce/service/apps/product/services/product'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('product list', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`

  const product = (name: string, fields: Record<string, unknown> = {}) =>
    new ProductService(db).create({ name, slug: name, sku: name, price: '10', stockQuantity: 5, ...fields })

  const openList = async (query = '') => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}/products${query}`)
    return page
  }

  const names = (page: Awaited<ReturnType<typeof openList>>) =>
    page.locator('tbody tr [data-product-name]').allTextContents()

  test('views, the category filter and sorting stay in the URL', async () => {
    const prefix = unique('views')
    const categories = new CategoryService(db)
    const parent = await categories.create({ name: unique('Parent'), slug: unique('parent') })
    const child = await categories.create({ name: unique('Child'), slug: unique('child'), parentId: parent.id })
    await product(`${prefix}-b-draft`)
    await product(`${prefix}-a-published`, { status: 'Published', categoryId: child.id })
    await product(`${prefix}-c-inactive`, { isActive: false })
    const page = await openList(`?q=${prefix}`)
    await page.getByText(`${prefix}-c-inactive`).waitFor()

    // Newest first
    await page.getByRole('tab', { name: 'Drafts' }).click()
    await page.waitForURL('**view=drafts**')
    await expect.poll(() => names(page)).toEqual([`${prefix}-c-inactive`, `${prefix}-b-draft`])
    await page.getByRole('tab', { name: 'Inactive' }).click()
    await expect.poll(() => names(page)).toEqual([`${prefix}-c-inactive`])

    // A category also shows the products in its subcategories
    await page.goto(`${process.env.BETTER_AUTH_URL}/products?q=${prefix}&category=${parent.id}`)
    await expect.poll(() => names(page)).toEqual([`${prefix}-a-published`])

    await page.goto(`${process.env.BETTER_AUTH_URL}/products?q=${prefix}`)
    await page.getByRole('button', { name: 'Name', exact: true }).click()
    await page.waitForURL('**sort=nameAsc**')
    await expect.poll(() => names(page)).toEqual([`${prefix}-a-published`, `${prefix}-b-draft`, `${prefix}-c-inactive`])
    await page.reload()
    await expect.poll(() => names(page)).toEqual([`${prefix}-a-published`, `${prefix}-b-draft`, `${prefix}-c-inactive`])
  })

  test('publishes the selected products', async () => {
    const prefix = unique('bulk')
    const first = await product(`${prefix}-1`)
    const second = await product(`${prefix}-2`)
    const untouched = await product(`${prefix}-3`)
    const page = await openList(`?q=${prefix}`)

    await page.getByRole('checkbox', { name: `Select ${first.name}` }).click()
    await page.getByRole('checkbox', { name: `Select ${second.name}` }).click()
    await page.getByText('2 selected').waitFor()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()

    await page.getByText('Published 2 products').first().waitFor()
    const service = new ProductService(db)
    expect((await service.get(first.id))?.status).toBe('Published')
    expect((await service.get(second.id))?.status).toBe('Published')
    expect((await service.get(untouched.id))?.status).toBe('Draft')
    await expect.poll(() => page.getByText('2 selected').count()).toBe(0)
  })

  test('edits price and stock in place when the product has one variant', async () => {
    const prefix = unique('inline')
    const single = await product(`${prefix}-single`)
    const several = await product(`${prefix}-several`, { price: '20' })
    await new ProductVariantService(db).generateVariants(several.id, { Size: ['S', 'M'] })
    await db.update(productVariants).set({ price: '30' }).where(eq(productVariants.sku, `${several.name}-M`))
    const page = await openList(`?q=${prefix}`)

    await page.getByRole('button', { name: `Price of ${single.name}` }).click()
    await page.getByRole('textbox', { name: `Price of ${single.name}` }).fill('19.50')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: `Stock of ${single.name}` }).click()
    await page.getByRole('textbox', { name: `Stock of ${single.name}` }).fill('12')
    await page.keyboard.press('Enter')

    await expect.poll(async () => (await new ProductService(db).get(single.id))?.variants[0].stockQuantity).toBe(12)
    expect(Number((await new ProductService(db).get(single.id))?.variants[0].price)).toBe(19.5)
    await page.getByRole('button', { name: `Price of ${single.name}` }).filter({ hasText: '19.50' }).waitFor()

    // Several variants: a range, edited on the product page
    const row = page.locator('tbody tr', { hasText: several.name })
    await row.getByText('$20.00 – $30.00').waitFor()
    expect(await page.getByRole('button', { name: `Price of ${several.name}` }).count()).toBe(0)
  })

  test('remembers the chosen columns', async () => {
    const prefix = unique('columns')
    await product(`${prefix}-1`)
    const page = await openList(`?q=${prefix}`)
    await page.getByText(`${prefix}-1`).waitFor()
    expect(await page.getByRole('columnheader', { name: 'SKU' }).count()).toBe(0)

    await page.getByRole('button', { name: 'Columns', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: 'SKU' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Brand' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('columnheader', { name: 'SKU' }).waitFor()

    await page.reload()
    await page.getByRole('columnheader', { name: 'SKU' }).waitFor()
    expect(await page.getByRole('columnheader', { name: 'Brand' }).count()).toBe(0)
  })

  test('arrow keys and Enter open a product', async () => {
    const prefix = unique('keys')
    await product(`${prefix}-1`)
    const second = await product(`${prefix}-2`)
    const page = await openList(`?q=${prefix}&sort=nameAsc`)
    await page.getByText(second.name).waitFor()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForURL(`**/products/${second.id}`)
  })
})
