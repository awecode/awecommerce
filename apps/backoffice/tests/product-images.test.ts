import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { products } from '@awecommerce/service/apps/product/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { STAFF_EMAIL, fakeBucket, setupBackoffice, signedInPage, url } from './helpers'

type Page = Awaited<ReturnType<typeof signedInPage>>

// Just enough of each format for its signature
const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])
const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4])

describe.skipIf(!url)('product images', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const service = new ProductService(db)
  const cdn = (key: string) => `http://cdn.test/${key}`

  const open = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }
  const choose = (page: Page, ...files: { name: string; mimeType: string; buffer: Buffer }[]) =>
    page.getByLabel('Choose images').setInputFiles(files)
  const pngFile = (name = 'photo.png') => ({ name, mimeType: 'image/png', buffer: png })
  const jpegFile = (name = 'photo.jpg') => ({ name, mimeType: 'image/jpeg', buffer: jpeg })
  const bySlug = async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0]

  test('a new product takes files before it has a name, and uploads them under its slug on save', async () => {
    const page = await open('/products/new')
    expect(await page.getByLabel('Image URL').count()).toBe(0)

    await choose(page, pngFile('IMG_0042.png'))
    await page.getByText('Not uploaded yet').waitFor()
    await page.getByText('Thumbnail', { exact: true }).waitFor()
    const name = unique('Canvas Tote')
    const slug = name.toLowerCase().replaceAll(' ', '-')
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('SKU', { exact: true }).fill(slug)
    // Nothing is uploaded until save
    expect(fakeBucket().objects.has(`products/${slug}.png`)).toBe(false)
    await page.keyboard.press('ControlOrMeta+s')

    await page.waitForURL(/\/products\/\d+$/)
    const saved = await service.get(Number(page.url().split('/').pop()))
    expect(saved).toMatchObject({
      slug,
      images: [cdn(`products/${slug}.png`)],
      thumbnail: cdn(`products/${slug}.png`),
    })
    expect(new Uint8Array(fakeBucket().objects.get(`products/${slug}.png`)!.body)).toEqual(new Uint8Array(png))
  })

  test('a failed upload saves nothing, and the retry keeps what already uploaded', async () => {
    const page = await open('/products/new')
    const name = unique('Wool Scarf')
    const slug = name.toLowerCase().replaceAll(' ', '-')
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('SKU', { exact: true }).fill(slug)
    await choose(page, pngFile(), jpegFile())
    fakeBucket().failWhen((key) => key === `products/${slug}.jpg`)

    await page.getByRole('button', { name: /^Create/ }).click()
    await page.getByText('Could not upload photo.jpg').first().waitFor()
    expect(page.url()).toMatch(/\/products\/new$/)
    expect(await bySlug(slug)).toBeUndefined()
    // The PNG went up; the JPEG is still waiting on the form
    expect(fakeBucket().objects.has(`products/${slug}.png`)).toBe(true)
    await expect.poll(() => page.getByText('Not uploaded yet').count()).toBe(1)

    fakeBucket().failWhen(() => false)
    await page.getByRole('button', { name: /^Create/ }).click()
    await page.waitForURL(/\/products\/\d+$/)
    expect(await service.get(Number(page.url().split('/').pop()))).toMatchObject({
      slug,
      images: [cdn(`products/${slug}.png`), cdn(`products/${slug}.jpg`)],
      thumbnail: cdn(`products/${slug}.png`),
    })
    // Not uploaded twice
    expect(fakeBucket().objects.has(`products/${slug}-1.png`)).toBe(false)
  })

  test('an existing product: a new file as thumbnail, a removed image stays in the bucket, and a clash is numbered', async () => {
    const slug = unique('mug')
    fakeBucket().objects.set(`products/${slug}.png`, { body: png, headers: {} })
    const old = 'https://example.com/old-mug.jpg'
    const mug = await service.create({ name: slug, slug, sku: slug, price: '20', stockQuantity: 5, images: [old], thumbnail: old })
    const page = await open(`/products/${mug.id}`)

    await choose(page, pngFile())
    await page.getByText('Not uploaded yet').waitFor()
    // The new file's tile is the second one
    await page.getByRole('button', { name: 'Use as thumbnail' }).click()
    await page.getByRole('button', { name: 'Remove image' }).first().click()
    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText(`Saved ${slug}`).first().waitFor()

    // products/slug.png was taken, so the upload is products/slug-1.png
    expect(await service.get(mug.id)).toMatchObject({
      images: [cdn(`products/${slug}-1.png`)],
      thumbnail: cdn(`products/${slug}-1.png`),
    })
    expect(fakeBucket().objects.has(`products/${slug}.png`)).toBe(true)
  })

  test('a slug that cannot name a file is highlighted and nothing uploads', async () => {
    const page = await open('/products/new')
    const name = unique('Tote')
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Slug').fill(`${name} Bag`)
    await page.getByLabel('SKU', { exact: true }).fill(unique('sku'))
    await choose(page, pngFile())
    const before = fakeBucket().objects.size

    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText('Images are stored under the slug: use lowercase letters, numbers and hyphens').waitFor()
    expect(fakeBucket().objects.size).toBe(before)
    expect(page.url()).toMatch(/\/products\/new$/)
  })

  test('refuses other types on the form, and Discard drops files not uploaded', async () => {
    const slug = unique('vase')
    const vase = await service.create({ name: slug, slug, sku: slug, price: '20', stockQuantity: 5 })
    const page = await open(`/products/${vase.id}`)

    await choose(page, { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await page.getByText('logo.svg: images must be JPEG, PNG or WebP').waitFor()
    expect(await page.getByText('Not uploaded yet').count()).toBe(0)

    await choose(page, pngFile())
    await page.getByText('Unsaved changes').waitFor()
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect.poll(() => page.getByText('Not uploaded yet').count()).toBe(0)
    await expect.poll(() => page.getByText('Unsaved changes').count()).toBe(0)
  })
})
