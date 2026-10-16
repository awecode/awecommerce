import { describe, expect, test } from 'vitest'
import { OfferService } from '@awecommerce/service/apps/offer/services/offer'
import { CategoryService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('offers', async () => {
  const db = await setupBackoffice()
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const offers = new OfferService(db)

  const openPage = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('creates an offer from one form, with a preview of what it does', async () => {
    const shirts = await new CategoryService(db).create({ name: unique('Shirts'), slug: unique('shirts') })
    const page = await openPage('/offers/new')
    const name = unique('Shirt week')

    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByRole('radio', { name: /^Customers/ }).click()
    await page.getByRole('radio', { name: 'Any of these' }).click()
    await page.getByLabel('Categories', { exact: true }).click()
    await page.getByRole('option', { name: shirts.name }).click()
    await page.keyboard.press('Escape')
    await page.getByLabel('Percent').fill('15')
    await page.getByTestId('offer-preview').getByText(`15% off on any quantity, on ${shirts.name}. For every signed-in customer.`).waitFor()

    await page.keyboard.press('ControlOrMeta+s')
    await page.waitForURL(/\/offers\/\d+$/)
    const saved = await offers.getWithParts(Number(page.url().split('/').pop()))
    expect(saved).toMatchObject({
      name,
      type: 'user',
      includeAllUsers: true,
      combinesWithOtherOffers: true,
      benefit: { type: 'percentage' },
      products: { all: false, categories: [{ id: shirts.id }] },
    })
    expect(Number(saved!.benefit.value)).toBe(15)
  })

  test('says what is missing', async () => {
    const page = await openPage('/offers/new')
    await page.getByRole('radio', { name: /^Voucher/ }).click()
    await page.getByRole('button', { name: /^Create/ }).click()
    await page.getByText('Enter a name').waitFor()
    await page.getByText('Enter the code buyers type in').waitFor()
    await page.getByText('Enter a number, such as 10 or 4.99').first().waitFor()
    expect(page.url()).toMatch(/\/offers\/new$/)
  })

  test('lists running offers, edits one, and deletes it', async () => {
    const name = unique('Flash sale')
    const offer = await offers.createWithParts({
      name,
      type: 'site',
      products: { all: true },
      condition: { type: 'basket_quantity', value: '1' },
      benefit: { type: 'fixed_amount', value: '5' },
    })
    const page = await openPage('/offers')
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByText('$5.00 off each').waitFor()
    await page.getByRole('tab', { name: 'Scheduled' }).click()
    await page.waitForURL('**view=scheduled**')
    await expect.poll(() => row.count()).toBe(0)
    await page.getByRole('tab', { name: 'Running' }).click()
    await row.click()
    await page.waitForURL(`**/offers/${offer.id}`)

    // A number typed just before ⌘S counts
    await page.getByLabel('Overall').fill('50')
    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText(`Saved ${name}`).first().waitFor()
    expect((await offers.getWithParts(offer.id))!.overallLimit).toBe(50)

    await page.getByRole('switch', { name: /Combines with other offers/ }).click()
    await page.getByTestId('offer-preview').getByText('Does not combine with other offers').waitFor()
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect.poll(async () => (await offers.getWithParts(offer.id))!.combinesWithOtherOffers).toBe(false)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete offer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.waitForURL('**/offers')
    expect(await offers.getWithParts(offer.id)).toBeNull()
  })
})
