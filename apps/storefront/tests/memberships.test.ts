import { createPage } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { offerBenefits, offerConditions, offerRangeIncludedProducts, offerRanges, offers } from '@awecommerce/service/apps/offer/schemas'
import { productClasses } from '@awecommerce/service/apps/product/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'
import { setupStorefront, url } from './helpers'

type Page = Awaited<ReturnType<typeof createPage>>

describe.skipIf(!url)('memberships', async () => {
  const db = await setupStorefront()
  await new StoreSettingsService(db).updateSettings({ currency: 'USD', locale: 'en-US' })
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const memberships = new MembershipService(db)

  const product = async (price = '100', productClassId?: number) => {
    const slug = unique('item')
    return await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity: 10, status: 'Published', productClassId })
  }
  // A percentage offer on one product
  const offer = async (productId: number, percent: string, values: Partial<typeof offers.$inferInsert>) => {
    const name = unique('Offer')
    const [range] = await db.insert(offerRanges).values({ name, inclusiveFilter: true, includeAllBrands: true, includeAllCategories: true, includeAllProductClasses: true }).returning()
    await db.insert(offerRangeIncludedProducts).values({ rangeId: range!.id, productId })
    const [condition] = await db.insert(offerConditions).values({ rangeId: range!.id, type: 'basket_quantity', value: '1' }).returning()
    const [benefit] = await db.insert(offerBenefits).values({ name, type: 'percentage', value: percent }).returning()
    const [row] = await db.insert(offers).values({ name, type: 'user', conditionId: condition!.id, benefitId: benefit!.id, ...values }).returning()
    return row!
  }
  const addToCart = async (page: Page, variantId: number) => {
    await page.evaluate(async (body) => {
      await fetch('/api/store/cart/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    }, { variantId, quantity: 1 })
  }

  test('a guest is asked to sign in to buy a membership', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const platinum = await memberships.createPlan({ name: 'Platinum', slug: unique('platinum'), program: unique('music'), rank: 1 })
    const year = await product('99', membershipClass!.id)
    await memberships.addTerm({ planId: platinum.id, variantId: year.variants[0]!.id, months: 12 })
    const page = await createPage('/')
    await addToCart(page, year.variants[0]!.id)

    await page.goto(`${process.env.BETTER_AUTH_URL}/checkout`)
    await page.getByText('Sign in to buy a membership').waitFor()
    expect(await page.getByLabel('Email').count()).toBe(0)
    expect(await page.getByRole('button', { name: /^Place order/ }).isDisabled()).toBe(true)
    await page.getByRole('link', { name: 'Sign in' }).last().click()
    await page.waitForURL('**/login?redirect=/checkout')
  })

  test('the product page shows what members pay', async () => {
    const platinum = await memberships.createPlan({ name: 'Platinum', slug: unique('platinum'), program: unique('music'), rank: 1 })
    const jacket = await product('100')
    await offer(jacket.id, '20', { includedMembershipPlanIds: [platinum.id] })
    const page = await createPage(`/products/${jacket.slug}`)
    await page.getByTestId('member-price').getByText('Platinum members:').waitFor()
    await page.getByTestId('member-price').getByText('$80.00').waitFor()
  })

  test('a voucher left out for a bigger discount stays on the cart and says why', async () => {
    const lamp = await product('100')
    await offer(lamp.id, '20', { type: 'site' })
    const voucher = await offer(lamp.id, '15', { type: 'voucher', voucherCode: unique('SMALL').toUpperCase(), includeAllUsers: true, combinesWithOtherOffers: false })
    const page = await createPage('/')
    await addToCart(page, lamp.variants[0]!.id)

    await page.goto(`${process.env.BETTER_AUTH_URL}/cart`)
    await page.getByLabel('Voucher code').fill(voucher.voucherCode!)
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByText('Not combined: a better discount applies').waitFor()
    await page.getByRole('button', { name: `Remove voucher ${voucher.voucherCode}` }).click()
    await expect.poll(() => page.getByText('Not combined: a better discount applies').count()).toBe(0)
  })
})
