import { describe, expect, test } from 'vitest'
import { CategoryService, ProductService, ProductVariantService } from '@awecommerce/service/apps/product/services/product'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('product page', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const products = new ProductService(db)

  const product = (name: string, fields: Record<string, unknown> = {}) =>
    products.create({ name, slug: name, sku: name.toUpperCase(), price: '20', stockQuantity: 5, ...fields })

  const open = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('creates a product from the list', async () => {
    const name = unique('Canvas Tote')
    const page = await open('/products')

    await page.getByRole('link', { name: 'New product' }).click()
    await page.waitForURL('**/products/new')
    await page.getByLabel('Name', { exact: true }).fill(name)
    const slug = name.toLowerCase().replaceAll(' ', '-')
    expect(await page.getByLabel('Slug').inputValue()).toBe(slug)
    // A SKU is needed
    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText('Enter a SKU').waitFor()
    expect(page.url()).toMatch(/\/products\/new$/)
    await page.getByLabel('SKU', { exact: true }).fill(`${name}-sku`)
    await page.getByLabel('Price', { exact: true }).fill('24.50')
    await page.keyboard.press('ControlOrMeta+s')

    await page.waitForURL(/\/products\/\d+$/)
    await page.getByText(`Created ${name}`).first().waitFor()
    const created = await products.get(Number(page.url().split('/').pop()))
    expect(created).toMatchObject({ name, slug, status: 'Draft' })
    expect(created?.variants).toHaveLength(1)
    expect(created?.variants[0]).toMatchObject({ sku: `${name}-sku` })
    expect(Number(created?.variants[0].price)).toBe(24.5)
  })

  test('edits the details, images and status, and saves with ⌘S', async () => {
    const category = await new CategoryService(db).create({ name: unique('Bags'), slug: unique('bags') })
    const saved = await product(unique('tote'))
    const page = await open(`/products/${saved.id}`)
    const image = `https://example.com/${unique('tote')}.jpg`

    await page.getByLabel('Name', { exact: true }).fill(`${saved.name} large`)
    await page.locator('[contenteditable="true"]').first().click()
    await page.keyboard.type('Soft cotton canvas')
    await page.getByLabel('Category').click()
    await page.getByRole('option', { name: category.name }).click()
    await page.getByLabel('Status').click()
    await page.getByRole('option', { name: 'Published' }).click()
    await page.getByLabel('Image URL').fill(image)
    await page.getByRole('button', { name: 'Add image' }).click()
    // The first image becomes the thumbnail
    await page.getByText('Thumbnail', { exact: true }).waitFor()
    await page.getByText('Unsaved changes').waitFor()
    await page.keyboard.press('ControlOrMeta+s')

    await page.getByText(`Saved ${saved.name} large`).first().waitFor()
    const after = await products.get(saved.id)
    expect(after).toMatchObject({ name: `${saved.name} large`, categoryId: category.id, status: 'Published', images: [image], thumbnail: image })
    expect(after?.description).toContain('Soft cotton canvas')
    await expect.poll(() => page.getByText('Unsaved changes').count()).toBe(0)
  })

  test('asks before leaving with unsaved changes', async () => {
    const saved = await product(unique('scarf'))
    const page = await open(`/products/${saved.id}`)

    await page.getByLabel('Name', { exact: true }).fill('Changed name')
    await page.getByRole('link', { name: 'Products', exact: true }).click()
    await page.getByText('Discard changes?').waitFor()
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(page.url()).toContain(`/products/${saved.id}`)
    expect(await page.getByLabel('Name', { exact: true }).inputValue()).toBe('Changed name')

    await page.getByRole('link', { name: 'Products', exact: true }).click()
    await page.getByRole('button', { name: 'Discard' }).click()
    await page.waitForURL(/\/products$/)
    expect((await products.get(saved.id))?.name).toBe(saved.name)
  })

  test('generates variants from options, then saves edits and removals', async () => {
    const saved = await product(unique('tee'))
    const page = await open(`/products/${saved.id}`)

    await page.getByLabel('Option name').fill('Size')
    const values = page.getByLabel('Values')
    for (const value of ['S', 'M', 'L']) {
      await values.fill(value)
      await values.press('Enter')
    }
    await page.getByRole('button', { name: 'Generate variants' }).click()
    await page.getByText('Created 3 variants').first().waitFor()

    await page.getByLabel('Price of Size: M', { exact: true }).fill('22')
    await page.getByLabel('Stock of Size: S', { exact: true }).fill('7')
    await page.getByRole('button', { name: 'Remove Size: L' }).click()
    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText(`Saved ${saved.name}`).first().waitFor()

    const variants = (await products.get(saved.id))!.variants
    const bySize = Object.fromEntries(variants.map((v: any) => [v.options[0]?.value, v]))
    expect(Object.keys(bySize).sort()).toEqual(['M', 'S'])
    expect(Number(bySize.M.price)).toBe(22)
    expect(bySize.S.stockQuantity).toBe(7)
    expect(bySize.S.sku).toBe(saved.variants[0].sku)
  })

  test('renames and deletes options and their values', async () => {
    const saved = await product(unique('polo'))
    await new ProductVariantService(db).generateVariants(saved.id, { Size: ['S', 'M'], Colour: ['Red', 'Blue'] })
    const page = await open(`/products/${saved.id}`)
    const choose = async (button: string, item: string) => {
      await page.getByRole('button', { name: button, exact: true }).click()
      await page.getByRole('menuitem', { name: item }).click()
    }

    // Deleting a value deletes the variants that have it
    await choose('Size: M', 'Delete')
    await page.getByText('This deletes the 2 variants with M.').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText('Deleted the value and its variants').first().waitFor()
    await expect.poll(async () => (await products.get(saved.id))!.variants.length).toBe(2)

    // Colour still has two values in use, so it cannot go yet
    await page.getByRole('button', { name: 'Colour option' }).click()
    expect(await page.getByRole('menuitem', { name: /Delete/ }).isDisabled()).toBe(true)
    await page.keyboard.press('Escape')

    await choose('Size option', 'Rename')
    await page.getByRole('dialog').getByRole('textbox').fill('Fit')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await page.getByText('Renamed to Fit').first().waitFor()

    await choose('Colour: Blue', 'Delete')
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText('Deleted the value and its variants').first().waitFor()
    await choose('Colour option', 'Delete')
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText('Deleted the option').first().waitFor()

    const after = (await products.get(saved.id))!
    expect(after.options.map((o: any) => o.name)).toEqual(['Fit'])
    expect(after.variants.map((v: any) => v.options)).toEqual([[{ name: 'Fit', value: 'S' }]])
  })

  test('says when a product does not exist', async () => {
    const page = await open('/products/999999')
    await page.getByText('No such product').waitFor()
    expect(await page.getByRole('button', { name: /^Save/ }).count()).toBe(0)
    await page.getByRole('link', { name: 'Back to products' }).last().click()
    await page.waitForURL(/\/products$/)
  })

  test('the list beside the product opens other products', async () => {
    const prefix = unique('side')
    const first = await product(`${prefix}-first`)
    const second = await product(`${prefix}-second`)
    const page = await open(`/products/${first.id}`)
    // Only wide screens have it
    await page.setViewportSize({ width: 1600, height: 900 })

    await page.getByPlaceholder('Search products…').fill(prefix)
    await page.getByRole('link', { name: second.name }).click()
    await page.waitForURL(`**/products/${second.id}`)
    await expect.poll(() => page.getByLabel('Name', { exact: true }).inputValue()).toBe(second.name)
  })
})
