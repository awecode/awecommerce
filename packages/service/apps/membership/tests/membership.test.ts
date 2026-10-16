import { beforeAll, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { MembershipService } from 'apps/membership/services/membership'
import { memberships } from 'apps/membership/schemas'
import { ProductService } from 'apps/product/services/product'
import { CartService } from 'apps/cart/services/cart'
import { OrderService } from 'apps/order/services/order'

const service = new MembershipService(db)

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

let count = 0
const unique = (name: string) => `${name}-${++count}`

const plan = async (program: string, rank: number, name = unique('plan')) =>
  await service.createPlan({ name, slug: unique('plan'), program, rank })

// Whole days from now, so time passing during the test does not matter
const daysFromNow = (date: string) => Math.round((new Date(date).getTime() - Date.now()) / 86_400_000) + 0

test('a grant starts now and runs for its months', async () => {
  const userId = unique('member')
  const premium = await plan(unique('music'), 1)
  const granted = await service.grant({ userId, planId: premium.id, months: 12, grantedBy: 'staff-1' })

  expect(daysFromNow(granted.startsAt)).toBe(0)
  expect(daysFromNow(granted.endsAt)).toBeGreaterThanOrEqual(365)
  expect(daysFromNow(granted.endsAt)).toBeLessThanOrEqual(366)
  const active = await service.activeMemberships(userId)
  expect(active.map((m) => [m.id, m.plan.name])).toEqual([[granted.id, premium.name]])
})

test('the same plan again starts when the current one ends', async () => {
  const userId = unique('member')
  const premium = await plan(unique('music'), 1)
  const first = await service.grant({ userId, planId: premium.id, months: 6 })
  const renewal = await service.grant({ userId, planId: premium.id, months: 6 })

  expect(new Date(renewal.startsAt).getTime()).toBe(new Date(first.endsAt).getTime())
  expect((await service.activeMemberships(userId)).map((m) => m.id)).toEqual([first.id])
})

test('a higher tier replaces the running and waiting ones in its program', async () => {
  const userId = unique('member')
  const program = unique('music')
  const premium = await plan(program, 1)
  const platinum = await plan(program, 2)
  const running = await service.grant({ userId, planId: premium.id, months: 6 })
  const waiting = await service.grant({ userId, planId: premium.id, months: 6 })

  const upgrade = await service.grant({ userId, planId: platinum.id, months: 12 })

  expect(daysFromNow(upgrade.startsAt)).toBe(0)
  const rows = new Map((await service.history(userId)).map((m) => [m.id, m]))
  expect(daysFromNow(rows.get(running.id)!.endsAt)).toBe(0)
  expect(rows.get(running.id)!.status).toBe('active')
  expect(rows.get(waiting.id)).toMatchObject({ status: 'cancelled', cancellationReason: `Replaced by ${platinum.name}` })
  expect((await service.activeMemberships(userId)).map((m) => m.planId)).toEqual([platinum.id])
})

test('a lower tier waits for the higher one to end', async () => {
  const userId = unique('member')
  const program = unique('music')
  const premium = await plan(program, 1)
  const platinum = await plan(program, 2)
  const current = await service.grant({ userId, planId: platinum.id, months: 3 })
  const lower = await service.grant({ userId, planId: premium.id, months: 3 })

  expect(new Date(lower.startsAt).getTime()).toBe(new Date(current.endsAt).getTime())
  expect((await service.activeMemberships(userId)).map((m) => m.planId)).toEqual([platinum.id])
})

test('memberships of different programs run side by side', async () => {
  const userId = unique('member')
  const music = await plan(unique('music'), 1)
  const movies = await plan(unique('movies'), 1)
  await service.grant({ userId, planId: music.id, months: 1 })
  await service.grant({ userId, planId: movies.id, months: 1 })

  expect((await service.activeMemberships(userId)).map((m) => m.planId).sort()).toEqual([music.id, movies.id].sort())
})

test('an ended or cancelled membership does not count', async () => {
  const userId = unique('member')
  const music = await plan(unique('music'), 1)
  const movies = await plan(unique('movies'), 1)
  const ended = await service.grant({ userId, planId: music.id, months: 1 })
  await db.update(memberships).set({ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-02-01T00:00:00Z' }).where(eq(memberships.id, ended.id))
  const cancelled = await service.grant({ userId, planId: movies.id, months: 1 })

  await service.cancel(cancelled.id, 'Asked to leave')
  await expect(service.cancel(cancelled.id, 'Again')).rejects.toThrow(`Membership is already cancelled: ${cancelled.id}`)
  await expect(service.cancel(999999, 'Missing')).rejects.toThrow('Membership not found: 999999')
  expect(await service.activeMemberships(userId)).toEqual([])
  // The next grant of the ended plan starts now
  expect(daysFromNow((await service.grant({ userId, planId: music.id, months: 1 })).startsAt)).toBe(0)
})

test('rejects a grant of less than a month or for a missing plan', async () => {
  const music = await plan(unique('music'), 1)
  await expect(service.grant({ userId: 'x', planId: music.id, months: 0 })).rejects.toThrow('A membership is at least 1 month')
  await expect(service.grant({ userId: 'x', planId: 999999, months: 1 })).rejects.toThrow('Membership plan not found: 999999')
})

test('terms link variants to plans', async () => {
  const music = await plan(unique('music'), 1)
  const slug = unique('membership-product')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 0 })
  const term = await service.addTerm({ planId: music.id, variantId: product.variants[0].id, months: 12 })

  const terms = await service.termsForVariants([product.variants[0].id, 999999])
  expect(terms.get(product.variants[0].id)).toMatchObject({ id: term.id, months: 12, plan: { id: music.id } })
  expect(terms.has(999999)).toBe(false)
  await expect(service.addTerm({ planId: music.id, variantId: product.variants[0].id, months: 0 })).rejects.toThrow('A term is at least 1 month')
})

test('only a signed-in buyer can order a membership', async () => {
  const music = await plan(unique('music'), 1)
  const slug = unique('membership-product')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 10, status: 'Published' })
  await service.addTerm({ planId: music.id, variantId: product.variants[0].id, months: 12 })
  const carts = new CartService(db)

  const guestCart = await carts.create()
  await carts.addToCart(guestCart.id, product.variants[0].id, 1)
  expect((await carts.getCartSummary(guestCart.sessionId)).requiresAccount).toBe(true)
  await expect(new OrderService(db).createFromCart(guestCart.id)).rejects.toThrow('Sign in to buy a membership')

  const memberCart = await carts.create(unique('member'))
  await carts.addToCart(memberCart.id, product.variants[0].id, 1)
  expect((await new OrderService(db).createFromCart(memberCart.id)).lines).toHaveLength(1)
})

test('plans list by program and rank, with search, pages and their terms', async () => {
  const program = unique('films')
  const basic = await plan(program, 1, unique('Basic'))
  const premium = await plan(program, 2, unique('Premium'))
  const slug = unique('films-year')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '50', stockQuantity: 0 })
  await service.addTerm({ planId: premium.id, variantId: product.variants[0].id, months: 12 })

  const found = await service.listPlans({ q: program, pagination: { page: 1, size: 10 } })
  expect(found.results.map((p) => [p.id, p.termCount])).toEqual([[premium.id, 1], [basic.id, 0]])
  expect(found.pagination.total).toBe(2)
  await service.updatePlan(basic.id, { isActive: false })
  expect((await service.listPlans({ q: program, isActive: true })).map((p) => p.id)).toEqual([premium.id])

  const shown = await service.getPlan(premium.id)
  expect(shown!.terms[0]).toMatchObject({ months: 12, variant: { sku: slug, product: { name: slug } } })
})

test('a plan with memberships cannot be deleted; one without can', async () => {
  const used = await plan(unique('music'), 1)
  await service.grant({ userId: unique('member'), planId: used.id, months: 1 })
  await expect(service.deletePlan(used.id)).rejects.toThrow()
  const unused = await plan(unique('music'), 1)
  expect((await service.deletePlan(unused.id)).id).toBe(unused.id)
  expect(await service.getPlan(unused.id)).toBeNull()
  await expect(service.deletePlan(unused.id)).rejects.toThrow(`Membership plan not found: ${unused.id}`)
})

test('lists memberships with their state, by person, plan and state', async () => {
  const userId = unique('member')
  const music = await plan(unique('music'), 1)
  const movies = await plan(unique('movies'), 1)
  const running = await service.grant({ userId, planId: music.id, months: 1 })
  const renewal = await service.grant({ userId, planId: music.id, months: 1 })
  const cancelled = await service.grant({ userId, planId: movies.id, months: 1 })
  await service.cancel(cancelled.id, 'Asked to leave')
  const ended = await service.grant({ userId, planId: movies.id, months: 1 })
  await db.update(memberships).set({ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-02-01T00:00:00Z' }).where(eq(memberships.id, ended.id))

  const states = new Map((await service.list({ userId })).map((m) => [m.id, m.state]))
  expect(Object.fromEntries(states)).toEqual({
    [running.id]: 'active',
    [renewal.id]: 'upcoming',
    [cancelled.id]: 'cancelled',
    [ended.id]: 'ended',
  })
  expect((await service.list({ userIds: [userId], state: 'upcoming' })).map((m) => m.id)).toEqual([renewal.id])
  const page = await service.list({ userId, planId: movies.id, pagination: { page: 1, size: 1 } })
  expect(page.pagination.total).toBe(2)
  expect(page.results[0].plan.name).toBe(movies.name)
  expect(await service.list({ userIds: [] })).toEqual([])
})

test('a term of a plan turned off is no longer sold', async () => {
  const music = await plan(unique('music'), 1)
  const slug = unique('membership-product')
  const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 10, status: 'Published' })
  await service.addTerm({ planId: music.id, variantId: product.variants[0].id, months: 12 })
  await service.updatePlan(music.id, { isActive: false })
  const carts = new CartService(db)
  const cart = await carts.create(unique('member'))
  await carts.addToCart(cart.id, product.variants[0].id, 1)

  expect((await carts.getCartSummary(cart.sessionId)).lines[0].isAvailable).toBe(false)
  await expect(new OrderService(db).createFromCart(cart.id)).rejects.toThrow(`Product variant is not available: ${slug}`)
})

test('current plans: running, waiting, and recently ended, but not cancelled or long ended', async () => {
  const userId = unique('member')
  const music = await plan(unique('music'), 1, unique('Music'))
  const films = await plan(unique('films'), 1, unique('Films'))
  const games = await plan(unique('games'), 1, unique('Games'))
  const books = await plan(unique('books'), 1, unique('Books'))
  const first = await service.grant({ userId, planId: music.id, months: 1 })
  const renewal = await service.grant({ userId, planId: music.id, months: 6 })
  const waiting = await service.grant({ userId, planId: films.id, months: 1 })
  await db.update(memberships).set({ startsAt: '2099-01-01T00:00:00Z', endsAt: '2099-02-01T00:00:00Z' }).where(eq(memberships.id, waiting.id))
  const recent = await service.grant({ userId, planId: games.id, months: 1 })
  const ended = new Date(Date.now() - 10 * 86_400_000).toISOString()
  await db.update(memberships).set({ startsAt: '2020-01-01T00:00:00Z', endsAt: ended }).where(eq(memberships.id, recent.id))
  const old = await service.grant({ userId, planId: books.id, months: 1 })
  await db.update(memberships).set({ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-02-01T00:00:00Z' }).where(eq(memberships.id, old.id))
  const cancelled = await service.grant({ userId, planId: books.id, months: 1 })
  await service.cancel(cancelled.id, 'Asked to leave')

  const current = await service.currentPlans(userId)
  expect(current.map((c) => [c.plan.id, c.state])).toEqual([[films.id, 'upcoming'], [music.id, 'active'], [games.id, 'ended']])
  const musicPlan = current.find((c) => c.plan.id === music.id)!
  // From the running one to the end of the renewal
  expect(new Date(musicPlan.startsAt).getTime()).toBe(new Date(first.startsAt).getTime())
  expect(new Date(musicPlan.endsAt).getTime()).toBe(new Date(renewal.endsAt).getTime())
  expect((await service.currentPlans(userId, { endedWithinDays: 5 })).map((c) => c.plan.id)).not.toContain(games.id)
})

test('terms on sale: active plan, active variant, listed product', async () => {
  const music = await plan(unique('music'), 1)
  const off = await plan(unique('music'), 1)
  await service.updatePlan(off.id, { isActive: false })
  const product = async (status: 'Published' | 'Draft', price = '40') => {
    const slug = unique('term-product')
    return await new ProductService(db).create({ name: slug, slug, sku: slug, price, stockQuantity: 0, status })
  }
  const year = await product('Published', '70')
  const half = await product('Published', '40')
  const draft = await product('Draft')
  const retired = await product('Published')
  await service.addTerm({ planId: music.id, variantId: year.variants[0].id, months: 12 })
  await service.addTerm({ planId: music.id, variantId: half.variants[0].id, months: 6 })
  await service.addTerm({ planId: music.id, variantId: draft.variants[0].id, months: 3 })
  await service.addTerm({ planId: off.id, variantId: retired.variants[0].id, months: 1 })

  expect(await service.termsOnSale([music.id, off.id])).toEqual([
    expect.objectContaining({ planId: music.id, months: 6, variantId: half.variants[0].id, productSlug: half.slug }),
    expect.objectContaining({ planId: music.id, months: 12, variantId: year.variants[0].id }),
  ])
  expect(Number((await service.termsOnSale([music.id]))[1].price)).toBe(70)
  expect(await service.termsOnSale([])).toEqual([])
})

test('plans to join: other programs, and higher tiers of the one held', async () => {
  const userId = unique('member')
  const music = unique('music')
  const films = unique('films')
  const silver = await plan(music, 1)
  const gold = await plan(music, 2)
  const bronze = await plan(music, 0)
  const cinema = await plan(films, 1)
  const noTerms = await plan(films, 2)
  const closed = await plan(films, 3)
  await service.updatePlan(closed.id, { isActive: false })
  for (const { id } of [silver, gold, bronze, cinema, closed]) {
    const slug = unique('join-product')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 0, status: 'Published' })
    await service.addTerm({ planId: id, variantId: product.variants[0].id, months: 12 })
  }
  await service.grant({ userId, planId: silver.id, months: 1 })

  const options = (await service.plansToJoin(userId)).filter((o) => [music, films].includes(o.plan.program))
  // By program (films, then music): bronze and silver itself are left out
  expect(options.map((o) => [o.plan.id, o.replaces?.id ?? null, o.terms.length])).toEqual([
    [cinema.id, null, 1],
    [gold.id, silver.id, 1],
  ])
  expect(options.map((o) => o.plan.id)).not.toContain(noTerms.id)

  // A guest: every plan on sale
  const forGuest = (await service.plansToJoin()).filter((o) => [music, films].includes(o.plan.program))
  expect(forGuest.map((o) => o.plan.id)).toEqual([cinema.id, gold.id, silver.id, bronze.id])
  expect(forGuest.every((o) => o.replaces === null)).toBe(true)
})

test('a membership added to the cart replaces the ones of its program', async () => {
  const program = unique('music')
  const [silver, gold, films] = [await plan(program, 1), await plan(program, 2), await plan(unique('films'), 1)]
  const term = async (planId: number, months: number) => {
    const slug = unique('membership-product')
    const product = await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 10, status: 'Published' })
    await service.addTerm({ planId, variantId: product.variants[0].id, months })
    return product.variants[0].id
  }
  const [silverYear, silverMonth, goldYear, filmsYear] = [await term(silver.id, 12), await term(silver.id, 1), await term(gold.id, 12), await term(films.id, 12)]
  const other = await new ProductService(db).create({ name: unique('mug'), slug: unique('mug'), sku: unique('mug'), price: '5', stockQuantity: 10, status: 'Published' })
  const carts = new CartService(db)
  const cart = await carts.create(unique('member'))
  const variants = async () => (await carts.getCartContentForSession(cart.sessionId)).lines.map((l) => [l.variantId, l.quantity]).sort()

  await carts.addToCart(cart.id, other.variants[0].id, 1)
  await carts.addToCart(cart.id, filmsYear, 1)
  await carts.addToCart(cart.id, silverYear, 1)
  // The same term again, another term, then another plan of the program
  await carts.addToCart(cart.id, silverYear, 1)
  expect(await variants()).toEqual([[other.variants[0].id, 1], [filmsYear, 1], [silverYear, 1]].sort())
  await carts.addToCart(cart.id, silverMonth, 1)
  await carts.addToCart(cart.id, goldYear, 1)
  expect(await variants()).toEqual([[other.variants[0].id, 1], [filmsYear, 1], [goldYear, 1]].sort())

  // Signing in: the guest cart's plan of a program wins over the account's
  const guest = await carts.create()
  await carts.addToCart(guest.id, silverMonth, 1)
  const merged = await carts.mergeCarts(cart.userId!, guest.sessionId)
  expect(merged.lines.map((l) => [l.variantId, l.quantity]).sort()).toEqual([[other.variants[0].id, 1], [filmsYear, 1], [silverMonth, 1]].sort())
})
