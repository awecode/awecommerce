import { createPage } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, test } from 'vitest'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('backoffice shell and sign-in', async () => {
  // The store's name, currency and locale, which the server reads at start
  Object.assign(process.env, { NUXT_PUBLIC_STORE_NAME: 'Northwind', NUXT_PUBLIC_STORE_CURRENCY: 'EUR', NUXT_PUBLIC_STORE_LOCALE: 'de-DE' })
  afterAll(() => {
    for (const key of ['NUXT_PUBLIC_STORE_NAME', 'NUXT_PUBLIC_STORE_CURRENCY', 'NUXT_PUBLIC_STORE_LOCALE']) delete process.env[key]
  })
  const db = await setupBackoffice()

  test('a guest is sent to the sign-in page', async () => {
    const page = await createPage('/')

    await page.waitForURL('**/login**')
    expect(await page.getByRole('heading', { name: 'Sign in to the backoffice' }).isVisible()).toBe(true)
  })

  test('staff sign in and land on Products, in the store currency', async () => {
    const slug = `shell-product-${Date.now()}`
    await new ProductService(db).create({ name: `Shell Test Mug ${slug}`, slug, sku: slug, price: '12.5' })

    const page = await signedInPage(db, STAFF_EMAIL)

    await page.waitForURL('**/products')
    await page.getByText(`Shell Test Mug ${slug}`).waitFor()
    // de-DE writes euros as 12,50 €
    expect(await page.getByText('12,50 €').first().isVisible()).toBe(true)
    expect(await page.getByText('Northwind').first().isVisible()).toBe(true)
  })

  test('a customer who signs in gets the no-access page', async () => {
    const page = await signedInPage(db, `customer-${Date.now()}@example.com`)

    await page.waitForURL('**/no-access')
    expect(await page.getByRole('heading', { name: 'No access' }).isVisible()).toBe(true)
  })

  test('the user menu switches to dark mode', async () => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')

    await page.getByRole('button', { name: STAFF_EMAIL }).click()
    await page.getByRole('menuitem', { name: 'Appearance' }).hover()
    await page.getByRole('menuitemcheckbox', { name: 'Dark' }).click()

    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  })
})
