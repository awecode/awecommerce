import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, test } from 'vitest'
import { shippingMethods } from '@awecommerce/service/apps/order/schemas'
import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'
import { TaxService } from '@awecommerce/service/apps/tax/services/tax'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('settings', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const tax = new TaxService(db)
  // Other test files expect no tax and no loyalty
  afterAll(async () => {
    await tax.updateSettings({ pricesIncludeTax: false, defaultRate: '0', taxShipping: false })
    await new LoyaltyService(db).updateSettings({ isEnabled: false, earnRate: null, redeemRate: null, expiresAfterInDays: null })
  })

  const open = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('the sidebar has a Settings group with tax, shipping and loyalty', async () => {
    const page = await open('/products')
    const nav = page.getByRole('navigation').first()
    expect(await nav.getByRole('link', { name: 'Store', exact: true }).count()).toBe(0)
    for (const [label, path] of [['Tax', '/settings/tax'], ['Shipping', '/settings/shipping'], ['Loyalty', '/settings/loyalty']]) {
      expect(await nav.getByRole('link', { name: label, exact: true }).getAttribute('href')).toBe(path)
    }
  })

  test('asks before leaving with unsaved changes', async () => {
    const page = await open('/settings/tax')
    await page.getByLabel('Default tax rate').fill('7')
    await page.getByRole('link', { name: 'Loyalty', exact: true }).click()
    await page.getByText('Discard changes?').waitFor()
    await page.getByRole('button', { name: 'Discard' }).click()
    await page.waitForURL('**/settings/loyalty')
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
