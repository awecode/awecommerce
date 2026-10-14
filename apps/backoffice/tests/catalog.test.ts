import { describe, expect, test } from 'vitest'
import { BrandService, CategoryService, ProductService } from '@awecommerce/service/apps/product/services/product'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('catalog screens', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`

  const openScreen = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('creates a brand, with the slug filled from the name', async () => {
    const page = await openScreen('/catalog/brands')
    const name = unique('Acme Tools')

    await page.getByRole('button', { name: 'New brand' }).click()
    await page.getByLabel('Name').fill(name)
    expect(await page.getByLabel('Slug').inputValue()).toBe(name.toLowerCase().replaceAll(' ', '-'))
    await page.getByRole('button', { name: /^Save/ }).click()

    // The toast text is also in a screen-reader announcement
    await page.getByText(`Created ${name}`).first().waitFor()
    await page.getByRole('cell', { name, exact: true }).waitFor()
  })

  test('search narrows the list and stays in the URL', async () => {
    const wanted = await new BrandService(db).create({ name: unique('Findme'), slug: unique('findme').replaceAll(' ', '-') })
    const other = await new BrandService(db).create({ name: unique('Other'), slug: unique('other').replaceAll(' ', '-') })
    const page = await openScreen('/catalog/brands')

    await page.getByRole('cell', { name: other.name, exact: true }).waitFor()
    await page.getByPlaceholder('Search…').fill(wanted.name)
    await page.waitForURL(`**q=${encodeURIComponent(wanted.name).replaceAll('%20', '+')}**`)
    await expect.poll(() => page.getByRole('cell', { name: other.name, exact: true }).count()).toBe(0)
    await page.getByRole('cell', { name: wanted.name, exact: true }).waitFor()
  })

  test('the parent picker leaves out the category and its subcategories', async () => {
    const categories = new CategoryService(db)
    const top = await categories.create({ name: unique('Top'), slug: unique('top').replaceAll(' ', '-') })
    const child = await categories.create({ name: unique('Child'), slug: unique('child').replaceAll(' ', '-'), parentId: top.id })
    const elsewhere = await categories.create({ name: unique('Elsewhere'), slug: unique('elsewhere').replaceAll(' ', '-') })
    // Filtered to it, so the child's row (showing it as parent) is not listed
    const page = await openScreen(`/catalog/categories?q=${encodeURIComponent(top.name)}`)

    await page.getByRole('cell', { name: top.name, exact: true }).click()
    await page.getByLabel('Parent').click()

    const options = page.getByRole('option')
    await options.first().waitFor()
    const labels = await options.allTextContents()
    expect(labels).toContain(elsewhere.name)
    expect(labels).not.toContain(top.name)
    expect(labels).not.toContain(child.name)
  })

  test('a brand in use cannot be deleted, and can be deactivated instead', async () => {
    const brand = await new BrandService(db).create({ name: unique('Busy'), slug: unique('busy').replaceAll(' ', '-') })
    const slug = `busy-product-${Date.now()}`
    await new ProductService(db).create({ name: slug, slug, sku: slug, price: '1', brandId: brand.id })
    const page = await openScreen(`/catalog/brands?q=${encodeURIComponent(brand.name)}`)

    await page.getByRole('button', { name: `Actions for ${brand.name}` }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText(`${brand.name} is in use`).waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click()

    await page.getByText(`${brand.name} deactivated`).first().waitFor()
    await page.getByRole('row', { name: new RegExp(brand.name) }).getByText('Inactive').waitFor()
  })

  test('closing with unsaved changes asks first', async () => {
    const page = await openScreen('/catalog/product-classes')

    await page.getByRole('button', { name: 'New product class' }).click()
    await page.getByLabel('Name').fill('Half done')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByText('Discard changes?').waitFor()
    await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Cancel' }).click()

    expect(await page.getByLabel('Name').inputValue()).toBe('Half done')
  })

  test('the ⌘K palette starts a new category', async () => {
    const page = await openScreen('/catalog/brands')
    await page.getByRole('button', { name: 'New brand' }).waitFor()

    await page.keyboard.press('Control+k')
    await page.getByRole('dialog').waitFor()
    // The palette's input has focus
    await page.keyboard.type('New category')
    await page.getByRole('option', { name: 'New category' }).click()

    await page.waitForURL('**/catalog/categories**')
    await page.getByRole('heading', { name: 'New category' }).waitFor()
    expect(await page.getByLabel('Name').isVisible()).toBe(true)
  })
})
