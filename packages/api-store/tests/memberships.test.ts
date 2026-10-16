import { describe, expect, test } from 'vitest'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { offerBenefits, offerConditions, offerRangeIncludedProducts, offerRanges, offers, productClasses } from '@awecommerce/service/core/db/pg/schema'
import { buyer, createUser, setupApi, unique, url } from './helpers'

describe.skipIf(!url)('memberships in the store', async () => {
  const db = await setupApi()
  const memberships = new MembershipService(db)

  // A membership product (not shipped, stock not counted) selling the plan
  const membershipProduct = async (planId: number, months = 12) => {
    const slug = unique('membership-class')
    const [productClass] = await db.insert(productClasses).values({ name: slug, slug, requiresShipping: false, trackStock: false }).returning()
    const productSlug = unique('platinum-year')
    const product = await new ProductService(db).create({
      name: productSlug,
      slug: productSlug,
      sku: productSlug,
      price: '99',
      stockQuantity: 0,
      status: 'Published',
      productClassId: productClass!.id,
    })
    await memberships.addTerm({ planId, variantId: product.variants[0]!.id, months })
    return product
  }
  const plan = async (name: string) =>
    await memberships.createPlan({ name, slug: unique(name.toLowerCase()), program: unique('music'), rank: 1 })
  // A percentage offer for the plan's members on one product
  const memberOffer = async (productId: number, planId: number, percent: string) => {
    const name = unique('member offer')
    const [range] = await db.insert(offerRanges).values({ name, inclusiveFilter: true, includeAllBrands: true, includeAllCategories: true, includeAllProductClasses: true }).returning()
    await db.insert(offerRangeIncludedProducts).values({ rangeId: range!.id, productId })
    const [condition] = await db.insert(offerConditions).values({ rangeId: range!.id, type: 'basket_quantity', value: '1' }).returning()
    const [benefit] = await db.insert(offerBenefits).values({ name, type: 'percentage', value: percent }).returning()
    await db.insert(offers).values({ name, type: 'user', includedMembershipPlanIds: [planId], conditionId: condition!.id, benefitId: benefit!.id })
  }

  test('a guest cannot check out a membership; a signed-in buyer can', async () => {
    const platinum = await plan('Platinum')
    const product = await membershipProduct(platinum.id)
    const guest = buyer()
    await guest('/api/store/cart/lines', { method: 'POST', body: { variantId: product.variants[0]!.id, quantity: 1 } })
    const cart = await guest('/api/store/cart')
    expect(cart.body.requiresAccount).toBe(true)
    const refused = await guest('/api/store/checkout', {
      method: 'POST',
      body: { expectedTotal: cart.body.total, guestUser: { name: 'Ann', email: `${unique('ann')}@example.com` } },
    })
    expect(refused.status).toBe(422)
    expect(refused.body.message).toBe('Sign in to buy a membership')

    const member = buyer()
    member.signIn((await createUser(db)).token)
    await member('/api/store/cart/lines', { method: 'POST', body: { variantId: product.variants[0]!.id, quantity: 1 } })
    const placed = await member('/api/store/checkout', { method: 'POST', body: { expectedTotal: (await member('/api/store/cart')).body.total } })
    expect(placed.status).toBe(200)
    expect(placed.body.metadata).toEqual({ paymentMethod: 'pay_later' })
    const shown = await member(`/api/store/orders/${placed.body.id}`)
    expect(shown.body.lines[0].note).toEqual({ title: 'Platinum membership', text: 'It starts once your payment is confirmed.' })
  })

  test('product pages show the member price, and a member sees their own', async () => {
    const premium = await plan('Premium')
    const platinum = await plan('Platinum')
    const slug = unique('jacket')
    const jacket = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '100', stockQuantity: 5, status: 'Published' })
    await memberOffer(jacket.id, premium.id, '10')
    await memberOffer(jacket.id, platinum.id, '20')
    const memberPrice = async (request: ReturnType<typeof buyer>) =>
      (await request(`/api/store/products/${slug}`)).body.variants[0].memberPrice

    expect(await memberPrice(buyer())).toEqual({ planId: platinum.id, planName: 'Platinum', price: '80', isYours: false })
    const { userId, token } = await createUser(db)
    await memberships.grant({ userId, planId: premium.id, months: 1 })
    const member = buyer()
    member.signIn(token)
    expect(await memberPrice(member)).toEqual({ planId: premium.id, planName: 'Premium', price: '90', isYours: true })

    const plainSlug = unique('plain')
    await new ProductService(db).create({ name: plainSlug, slug: plainSlug, sku: plainSlug, price: '10', stockQuantity: 5, status: 'Published' })
    expect((await buyer()(`/api/store/products/${plainSlug}`)).body.variants[0].memberPrice).toBeNull()
  })

  test('lists the buyer\'s memberships with the terms to renew them', async () => {
    const platinum = await plan('Platinum')
    const product = await membershipProduct(platinum.id, 12)
    const { userId, token } = await createUser(db)
    const running = await memberships.grant({ userId, planId: platinum.id, months: 1, grantedBy: 'staff' })
    const request = buyer()
    expect((await request('/api/store/memberships')).status).toBe(401)
    request.signIn(token)

    const { body } = await request('/api/store/memberships')
    expect(body.current).toEqual([
      expect.objectContaining({
        state: 'active',
        plan: { id: platinum.id, name: 'Platinum', program: platinum.program },
        terms: [expect.objectContaining({ variantId: product.variants[0]!.id, months: 12, price: '99' })],
      }),
    ])
    expect(body.history).toEqual([expect.objectContaining({ id: running.id, state: 'active', months: 1, orderId: null })])
    // Not the member's internal fields
    expect(body.history[0].grantedBy).toBeUndefined()
  })

  test('lists the plans a buyer can join, with upgrades over the one they hold', async () => {
    const program = unique('music')
    const silver = await memberships.createPlan({ name: 'Silver', slug: unique('silver'), program, rank: 1 })
    const gold = await memberships.createPlan({ name: 'Gold', slug: unique('gold'), program, rank: 2, description: 'Everything, sooner' })
    await membershipProduct(silver.id)
    const goldYear = await membershipProduct(gold.id)
    const { userId, token } = await createUser(db)
    await memberships.grant({ userId, planId: silver.id, months: 1 })
    const request = buyer()
    request.signIn(token)

    const { body } = await request('/api/store/memberships')
    const ids = body.toJoin.map((option: { plan: { id: number } }) => option.plan.id)
    expect(ids).not.toContain(silver.id)
    expect(body.toJoin.find((option: { plan: { id: number } }) => option.plan.id === gold.id)).toEqual({
      plan: { id: gold.id, name: 'Gold', program, description: 'Everything, sooner' },
      replaces: { id: silver.id, name: 'Silver' },
      terms: [{ id: expect.any(Number), variantId: goldYear.variants[0]!.id, months: 12, price: '99' }],
    })
  })

  test('lists the plans on sale to anyone, and only the ones to join to a member', async () => {
    const program = unique('music')
    const silver = await memberships.createPlan({ name: 'Silver', slug: unique('silver'), program, rank: 1 })
    const gold = await memberships.createPlan({ name: 'Gold', slug: unique('gold'), program, rank: 2 })
    const silverYear = await membershipProduct(silver.id)
    await membershipProduct(gold.id)
    const inProgram = (body: { plan: { id: number; program: string }; replaces: unknown }[]) =>
      body.filter((option) => option.plan.program === program).map((option) => [option.plan.id, option.replaces])

    const guest = buyer()
    const { body: forGuest } = await guest('/api/store/membership-plans')
    expect(inProgram(forGuest)).toEqual([[gold.id, null], [silver.id, null]])
    expect(forGuest.find((option: { plan: { id: number } }) => option.plan.id === silver.id).terms).toEqual([
      { id: expect.any(Number), variantId: silverYear.variants[0]!.id, months: 12, price: '99' },
    ])

    const { userId, token } = await createUser(db)
    await memberships.grant({ userId, planId: silver.id, months: 1 })
    const member = buyer()
    member.signIn(token)
    const { body: forMember } = await member('/api/store/membership-plans')
    expect(inProgram(forMember)).toEqual([[gold.id, { id: silver.id, name: 'Silver' }]])
  })
})

