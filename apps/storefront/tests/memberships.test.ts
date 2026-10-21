import { createPage } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { offerBenefits, offerConditions, offerRangeIncludedProducts, offerRanges, offers } from '@awecommerce/service/apps/offer/schemas'
import { memberships as membershipRows } from '@awecommerce/service/apps/membership/schemas'
import { productClasses } from '@awecommerce/service/apps/product/schemas'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { setupStorefront, signedInPage, url } from './helpers'

type Page = Awaited<ReturnType<typeof createPage>>

describe.skipIf(!url)('memberships', async () => {
  const db = await setupStorefront()
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

  test('a member renews from the account page, and sees the history', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const gold = await memberships.createPlan({ name: unique('Gold'), slug: unique('gold'), program: unique('music'), rank: 1 })
    const silver = await memberships.createPlan({ name: unique('Silver'), slug: unique('silver'), program: unique('films'), rank: 1 })
    const goldYear = await product('99', membershipClass!.id)
    await memberships.addTerm({ planId: gold.id, variantId: goldYear.variants[0]!.id, months: 12 })
    const silverYear = await product('50', membershipClass!.id)
    await memberships.addTerm({ planId: silver.id, variantId: silverYear.variants[0]!.id, months: 12 })

    const page = await signedInPage(db, `${unique('mem')}@example.com`)
    const userId = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    await memberships.grant({ userId, planId: gold.id, months: 1 })
    const ended = await memberships.grant({ userId, planId: silver.id, months: 1 })
    await db.update(membershipRows).set({ startsAt: '2020-01-01T00:00:00Z', endsAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }).where(eq(membershipRows.id, ended.id))

    await page.goto(`${process.env.BETTER_AUTH_URL}/account`)
    const goldCard = page.getByRole('group', { name: `${gold.name} membership` })
    await goldCard.getByText(/^Active until /).waitFor()
    const silverCard = page.getByRole('group', { name: `${silver.name} membership` })
    await silverCard.getByText(/^Ended on /).waitFor()
    await silverCard.getByText('Renewing starts it again today.').waitFor()

    await goldCard.getByRole('button', { name: 'Renew 12 months · $99.00' }).click()
    await page.getByRole('dialog').getByText(goldYear.name).waitFor()

    await page.goto(`${process.env.BETTER_AUTH_URL}/account/memberships`)
    await page.getByRole('heading', { name: 'History' }).waitFor()
    expect(await page.getByRole('listitem').filter({ hasText: gold.name }).count()).toBe(1)
    expect(await page.getByRole('listitem').filter({ hasText: silver.name }).getByText('Ended').count()).toBe(1)
  })

  test('a signed-in buyer joins a plan, or upgrades the one they hold, from the account page', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const program = unique('music')
    const silver = await memberships.createPlan({ name: unique('Silver'), slug: unique('silver'), program, rank: 1 })
    const gold = await memberships.createPlan({ name: unique('Gold'), slug: unique('gold'), program, rank: 2, description: 'Every album, a week early' })
    const cinema = await memberships.createPlan({ name: unique('Cinema'), slug: unique('cinema'), program: unique('films'), rank: 1 })
    for (const [planId, price] of [[silver.id, '50'], [gold.id, '90'], [cinema.id, '40']] as const) {
      await memberships.addTerm({ planId, variantId: (await product(price, membershipClass!.id)).variants[0]!.id, months: 12 })
    }

    const page = await signedInPage(db, `${unique('join')}@example.com`)
    await page.goto(`${process.env.BETTER_AUTH_URL}/account/memberships`)
    await page.getByText('You have no memberships yet.').waitFor()
    const cinemaCard = page.getByRole('group', { name: `Join ${cinema.name}` })
    await cinemaCard.getByRole('button', { name: 'Join 12 months · $40.00' }).click()
    // Straight to checkout, without the cart drawer
    await page.waitForURL('**/checkout')
    await page.getByRole('heading', { level: 1, name: 'Checkout' }).waitFor()
    await page.goto(`${process.env.BETTER_AUTH_URL}/account/memberships`)

    const userId = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    await memberships.grant({ userId, planId: silver.id, months: 1 })
    await page.reload()
    await page.getByRole('group', { name: `${silver.name} membership` }).getByText(/^Active until /).waitFor()
    expect(await page.getByRole('group', { name: `Join ${silver.name}` }).count()).toBe(0)
    const goldCard = page.getByRole('group', { name: `Join ${gold.name}` })
    await goldCard.getByText('Every album, a week early').waitFor()
    await goldCard.getByText(`Starts today and replaces your ${silver.name} membership.`).waitFor()
    await goldCard.getByRole('button', { name: 'Upgrade 12 months · $90.00' }).waitFor()
  })

  test('the home page shows the plans: guests sign in to join, members join', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const club = await memberships.createPlan({ name: unique('Club'), slug: unique('club'), program: unique('club'), rank: 1, description: '<p>Free tickets <strong>every month</strong></p><ul><li>Meet the team</li></ul>' })
    await memberships.addTerm({ planId: club.id, variantId: (await product('30', membershipClass!.id)).variants[0]!.id, months: 12 })

    const guest = await createPage('/')
    const guestCard = guest.getByRole('group', { name: `Join ${club.name}` })
    // The description's rich text, as formatted text
    await guestCard.locator('strong', { hasText: 'every month' }).waitFor()
    await guestCard.getByRole('listitem').filter({ hasText: 'Meet the team' }).waitFor()
    await guestCard.getByText('12 months · $30.00').waitFor()
    await guestCard.getByRole('link', { name: 'Sign in to join' }).click()
    await guest.waitForURL('**/login?redirect=/')

    const page = await signedInPage(db, `${unique('home')}@example.com`)
    await page.goto(`${process.env.BETTER_AUTH_URL}/`)
    await page.getByRole('group', { name: `Join ${club.name}` }).getByRole('button', { name: 'Join 12 months · $30.00' }).click()
    await page.waitForURL('**/checkout')
  })

  test('the account overview links to joining when the buyer has no memberships', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const plan = await memberships.createPlan({ name: unique('Friends'), slug: unique('friends'), program: unique('friends'), rank: 1 })
    await memberships.addTerm({ planId: plan.id, variantId: (await product('20', membershipClass!.id)).variants[0]!.id, months: 12 })

    const page = await signedInPage(db, `${unique('overview')}@example.com`)
    await page.goto(`${process.env.BETTER_AUTH_URL}/account`)
    await page.getByText('You are not a member yet.').waitFor()
    await page.getByRole('link', { name: 'Join a membership' }).click()
    await page.waitForURL('**/account/memberships')
    await page.getByRole('group', { name: `Join ${plan.name}` }).waitFor()

    // A member sees their membership instead
    const userId = await page.evaluate(async () => (await (await fetch('/api/auth/get-session')).json()).user.id)
    await memberships.grant({ userId, planId: plan.id, months: 1 })
    await page.goto(`${process.env.BETTER_AUTH_URL}/account`)
    await page.getByRole('group', { name: `${plan.name} membership` }).waitFor()
    expect(await page.getByRole('link', { name: 'Join a membership' }).count()).toBe(0)
  })

  test('a membership product page says what members get', async () => {
    const slug = unique('membership')
    const [membershipClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const plan = await memberships.createPlan({ name: unique('Patron'), slug: unique('patron'), program: unique('patrons'), rank: 1, description: '<ul><li>Early tickets</li></ul>' })
    const year = await product('60', membershipClass!.id)
    await memberships.addTerm({ planId: plan.id, variantId: year.variants[0]!.id, months: 12 })

    const page = await createPage(`/products/${year.slug}`)
    const section = page.getByTestId('membership')
    await section.getByText(`${plan.name} membership · 12 months`).waitFor()
    await section.getByRole('listitem').filter({ hasText: 'Early tickets' }).waitFor()

    // Not on other products
    const plain = await product('10')
    await page.goto(`${process.env.BETTER_AUTH_URL}/products/${plain.slug}`)
    await page.getByRole('heading', { level: 1, name: plain.name }).waitFor()
    expect(await page.getByTestId('membership').count()).toBe(0)
  })
})
