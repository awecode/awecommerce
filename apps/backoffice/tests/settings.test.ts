import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { shippingMethods } from '@awecommerce/service/apps/order/schemas'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { TaxService } from '@awecommerce/service/apps/tax/services/tax'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('settings', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const store = new StoreSettingsService(db)
  const tax = new TaxService(db)
  // Other test files check prices in US dollars and expect no tax
  afterAll(async () => {
    await store.updateSettings({ name: '', currency: 'USD', locale: 'en-US' })
    await tax.updateSettings({ pricesIncludeTax: false, defaultRate: '0', taxShipping: false })
    await new LoyaltyService(db).updateSettings({ isEnabled: false, earnRate: null, redeemRate: null, expiresAfterInDays: null })
  })

  const open = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('the sidebar has a Settings group with store, tax, shipping and loyalty', async () => {
    const page = await open('/products')
    const nav = page.getByRole('navigation').first()
    for (const [label, path] of [['Store', '/settings/store'], ['Tax', '/settings/tax'], ['Shipping', '/settings/shipping'], ['Loyalty', '/settings/loyalty']]) {
      expect(await nav.getByRole('link', { name: label, exact: true }).getAttribute('href')).toBe(path)
    }
  })

  test('changes the store name, currency and locale, with a sample price', async () => {
    await store.updateSettings({ name: 'Old Name', currency: 'USD', locale: 'en-US' })
    const page = await open('/settings/store')
    await page.getByLabel('Store name').fill('Linen & Oak')
    await page.getByLabel('Currency').click()
    await page.getByRole('combobox').last().fill('EUR')
    await page.getByRole('option', { name: /^EUR/ }).click()
    await page.getByLabel('Locale').fill('de-DE')
    await page.getByText('1.234,50 €').waitFor()
    await page.getByText('Prices are not converted').waitFor()
    await page.getByText('Unsaved changes').waitFor()

    await page.keyboard.press('ControlOrMeta+s')
    await page.getByText('Store settings saved').first().waitFor()
    expect(await store.getSettings()).toMatchObject({ name: 'Linen & Oak', currency: 'EUR', locale: 'de-DE' })
    // The sidebar shows the new name
    await page.getByText('Linen & Oak', { exact: true }).first().waitFor()
    await expect.poll(() => page.getByText('Unsaved changes').count()).toBe(0)
  })

  test('says so when the locale is unknown, and keeps the saved one', async () => {
    await store.updateSettings({ currency: 'USD', locale: 'en-US' })
    const page = await open('/settings/store')
    await page.getByLabel('Locale').fill('not a locale')
    await page.getByText('Not a locale this browser knows').waitFor()
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText('Unknown locale: not a locale').first().waitFor()
    expect((await store.getSettings()).locale).toBe('en-US')
  })

  test('asks before leaving with unsaved changes', async () => {
    const page = await open('/settings/store')
    await page.getByLabel('Store name').fill(unique('Changed'))
    await page.getByRole('link', { name: 'Tax', exact: true }).click()
    await page.getByText('Discard changes?').waitFor()
    await page.getByRole('button', { name: 'Discard' }).click()
    await page.waitForURL('**/settings/tax')
  })

  test('changes the tax settings, and leaves loyalty alone', async () => {
    await tax.updateSettings({ pricesIncludeTax: false, defaultRate: '0', taxShipping: false })
    const loyaltyBefore = await new LoyaltyService(db).getSettings()
    const page = await open('/settings/tax')
    await page.getByRole('switch', { name: 'Prices include tax' }).click()
    await page.getByLabel('Default tax rate').fill('13')
    await page.getByRole('switch', { name: 'Tax shipping' }).click()
    await page.getByRole('button', { name: /^Save/ }).click()

    await page.getByText('Tax settings saved').first().waitFor()
    const after = await tax.getSettings()
    expect(after).toMatchObject({ pricesIncludeTax: true, taxShipping: true })
    expect(Number(after.defaultRate)).toBe(13)
    expect(await new LoyaltyService(db).getSettings()).toEqual(loyaltyBefore)

    await page.getByLabel('Default tax rate').fill('thirteen')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText('Enter a rate, such as 13 or 12.5').waitFor()
  })

  test('turns loyalty on with its rates and expiry, with an example', async () => {
    const loyalty = new LoyaltyService(db)
    await loyalty.updateSettings({ isEnabled: false, earnRate: null, redeemRate: null, expiresAfterInDays: null })
    await store.updateSettings({ currency: 'USD', locale: 'en-US' })
    const page = await open('/settings/loyalty')
    await page.getByRole('switch', { name: 'Loyalty points' }).click()
    await page.getByLabel('Points per amount spent').fill('1')
    await page.getByTestId('loyalty-example').getByText('Spending $100.00 earns 100 points, which cannot be redeemed yet.').waitFor()
    await page.getByLabel('Value of one point').fill('0.01')
    await page.getByTestId('loyalty-example').getByText('Spending $100.00 earns 100 points, worth $1.00 at checkout.').waitFor()
    await page.getByLabel('Points expire after').fill('365')
    await page.keyboard.press('ControlOrMeta+s')

    await page.getByText('Loyalty settings saved').first().waitFor()
    const saved = await loyalty.getSettings()
    expect(saved).toMatchObject({ isEnabled: true, expiresAfterInDays: 365 })
    expect([Number(saved.earnRate), Number(saved.redeemRate)]).toEqual([1, 0.01])

    // Emptied, a rate is cleared
    await page.getByLabel('Value of one point').fill('')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText('Loyalty settings saved').first().waitFor()
    await expect.poll(async () => (await loyalty.getSettings()).redeemRate).toBeNull()
  })

  test('adds, edits and deletes shipping methods', async () => {
    const name = unique('Courier')
    const page = await open('/settings/shipping')
    await page.getByRole('button', { name: 'New shipping method' }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Price').fill('abc')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText('Enter a price, such as 5 or 4.99').waitFor()
    await page.getByLabel('Price').fill('5')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText(`Added ${name}`).first().waitFor()
    const row = page.getByRole('row', { name: new RegExp(name) })
    await row.getByText('$5.00').waitFor()
    const [created] = await db.select().from(shippingMethods).where(eq(shippingMethods.name, name))
    expect(Number(created!.price)).toBe(5)

    await row.click()
    await page.getByLabel('Price').fill('0')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText(`Saved ${name}`).first().waitFor()
    await row.getByText('Free').waitFor()

    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.getByText(`Deleted ${name}`).first().waitFor()
    await expect.poll(() => row.count()).toBe(0)
    expect(await new ShippingMethodService(db).get(created!.id)).toBeFalsy()
  })
})
