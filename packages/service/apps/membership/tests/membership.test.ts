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
