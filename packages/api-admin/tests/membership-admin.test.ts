import { describe, expect, test } from 'vitest'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { client, createSignedInUser, createUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('membership admin API', async () => {
  const db = await setupAdminApi()
  const staffEmail = `${unique('staff')}@example.com`
  const staff = await createSignedInUser(db, 'admin', staffEmail)
  const admin = client(staff.token)
  const post = (path: string, body: unknown) => admin(path, { method: 'POST', body })

  const createPlan = async (fields: Record<string, unknown> = {}) =>
    (await post('/api/admin/membership-plans', { name: unique('Platinum'), slug: unique('platinum'), program: unique('music'), rank: 1, ...fields })).body
  const variant = async () => {
    const slug = unique('platinum-year')
    return (await new ProductService(db).create({ name: slug, slug, sku: slug, price: '99', stockQuantity: 0 })).variants[0]!
  }

  test('is for staff only', async () => {
    expect((await client()('/api/admin/memberships')).status).toBe(401)
    expect((await client(await createUser(db, null))('/api/admin/membership-plans')).status).toBe(403)
  })

  test('creates, lists, changes and deletes plans', async () => {
    const program = unique('films')
    const basic = await createPlan({ name: 'Basic', program, rank: 1 })
    const premium = await createPlan({ name: 'Premium', program, rank: 2 })
    expect((await post('/api/admin/membership-plans', { name: 'Again', slug: basic.slug, program, rank: 1 })).status).toBe(409)
    expect((await post('/api/admin/membership-plans', { name: 'No program', slug: unique('x'), rank: 1 })).status).toBe(400)

    const listed = await admin(`/api/admin/membership-plans?q=${program}`)
    expect(listed.body.results.map((p: any) => p.name)).toEqual(['Premium', 'Basic'])
    expect(listed.body.results[0].termCount).toBe(0)
    const changed = await admin(`/api/admin/membership-plans/${basic.id}`, { method: 'PATCH', body: { isActive: false, description: 'Starter' } })
    expect(changed.body).toMatchObject({ isActive: false, description: 'Starter' })
    expect((await admin(`/api/admin/membership-plans?q=${program}&active=true`)).body.results.map((p: any) => p.id)).toEqual([premium.id])

    expect((await admin(`/api/admin/membership-plans/${basic.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await admin(`/api/admin/membership-plans/${basic.id}`)).status).toBe(404)
    // In use
    await post('/api/admin/memberships', { userId: staff.userId, planId: premium.id, months: 1 })
    const inUse = await admin(`/api/admin/membership-plans/${premium.id}`, { method: 'DELETE' })
    expect(inUse.status).toBe(409)
    expect(inUse.body.data.code).toBe('InUse')
  })

  test('links variants to a plan as terms', async () => {
    const plan = await createPlan()
    const year = await variant()
    const term = await post(`/api/admin/membership-plans/${plan.id}/terms`, { variantId: year.id, months: 12 })
    expect(term.status).toBe(200)
    expect((await post(`/api/admin/membership-plans/${plan.id}/terms`, { variantId: year.id, months: 6 })).status).toBe(409)
    expect((await post(`/api/admin/membership-plans/${plan.id}/terms`, { variantId: 999999, months: 6 })).status).toBe(422)
    expect((await post(`/api/admin/membership-plans/${plan.id}/terms`, { variantId: year.id, months: 0 })).status).toBe(400)

    const shown = await admin(`/api/admin/membership-plans/${plan.id}`)
    expect(shown.body.terms).toMatchObject([{ id: term.body.id, months: 12, variant: { id: year.id, sku: year.sku, product: { name: year.sku } } }])
    expect((await admin(`/api/admin/membership-terms/${term.body.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await admin(`/api/admin/membership-plans/${plan.id}`)).body.terms).toEqual([])
  })

  test('grants, extends, lists and cancels memberships', async () => {
    const email = `${unique('dee')}@example.com`
    const member = await createSignedInUser(db, null, email)
    const plan = await createPlan()
    const off = await createPlan({ isActive: false })
    expect((await post('/api/admin/memberships', { userId: member.userId, planId: off.id, months: 1 })).status).toBe(422)
    expect((await post('/api/admin/memberships', { userId: 'nobody', planId: plan.id, months: 1 })).status).toBe(404)

    const granted = await post('/api/admin/memberships', { userId: member.userId, planId: plan.id, months: 1 })
    expect(granted.body).toMatchObject({ userId: member.userId, planId: plan.id, grantedBy: staff.userId })
    // The same plan again waits for the first to end
    const extension = await post('/api/admin/memberships', { userId: member.userId, planId: plan.id, months: 3 })
    expect(new Date(extension.body.startsAt).getTime()).toBe(new Date(granted.body.endsAt).getTime())

    const listed = await admin(`/api/admin/memberships?q=${encodeURIComponent(email)}`)
    expect(listed.body.results.map((m: any) => [m.id, m.state])).toEqual([[extension.body.id, 'upcoming'], [granted.body.id, 'active']])
    expect(listed.body.results[0]).toMatchObject({ member: { email }, plan: { name: plan.name }, grantedByEmail: staffEmail })
    expect((await admin(`/api/admin/memberships?userId=${member.userId}&state=active`)).body.results.map((m: any) => m.id)).toEqual([granted.body.id])
    expect((await admin(`/api/admin/memberships?plan=${plan.id}`)).body.pagination.total).toBe(2)

    const cancelled = await post(`/api/admin/memberships/${extension.body.id}/cancel`, { reason: 'Granted by mistake' })
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancellationReason: 'Granted by mistake' })
    expect((await post(`/api/admin/memberships/${extension.body.id}/cancel`, { reason: 'Again' })).status).toBe(422)
    expect((await post(`/api/admin/memberships/${granted.body.id}/cancel`, {})).status).toBe(400)
  })
})
