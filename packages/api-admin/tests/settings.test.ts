import { describe, expect, test } from 'vitest'
import { client, createUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('admin settings and shipping API', async () => {
  const db = await setupAdminApi()
  const admin = client(await createUser(db, 'admin'))

  test('reads and changes the tax settings', async () => {
    const before = (await admin('/api/admin/settings/tax')).body
    expect(before).toHaveProperty('pricesIncludeTax')

    const changed = await admin('/api/admin/settings/tax', {
      method: 'PATCH',
      body: { defaultRate: '13', taxShipping: true },
    })

    expect(changed.status).toBe(200)
    expect(Number(changed.body.defaultRate)).toBe(13)
    // Fields not given keep their values
    expect(changed.body).toMatchObject({ taxShipping: true, pricesIncludeTax: before.pricesIncludeTax })
    expect((await admin('/api/admin/settings/tax')).body).toEqual(changed.body)
    await admin('/api/admin/settings/tax', { method: 'PATCH', body: { defaultRate: '0', taxShipping: false } })
  })

  test('reads and changes the loyalty settings', async () => {
    const changed = await admin('/api/admin/settings/loyalty', {
      method: 'PATCH',
      body: { isEnabled: true, earnRate: '1', redeemRate: '0.5', expiresAfterInDays: 365 },
    })

    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ isEnabled: true, expiresAfterInDays: 365 })
    expect(Number(changed.body.redeemRate)).toBe(0.5)
    const cleared = await admin('/api/admin/settings/loyalty', {
      method: 'PATCH',
      body: { isEnabled: false, expiresAfterInDays: null },
    })
    expect(cleared.body).toMatchObject({ isEnabled: false, expiresAfterInDays: null })
    expect(Number(cleared.body.redeemRate)).toBe(0.5)
  })

  test('manages shipping methods', async () => {
    const name = unique('Courier')
    const created = await admin('/api/admin/shipping-methods', { method: 'POST', body: { name, price: '15' } })
    expect(created.status).toBe(200)
    const { id } = created.body

    expect((await admin('/api/admin/shipping-methods')).body.map((m: any) => m.id)).toContain(id)
    expect((await admin(`/api/admin/shipping-methods/${id}`)).body.name).toBe(name)
    const changed = await admin(`/api/admin/shipping-methods/${id}`, { method: 'PATCH', body: { price: '20' } })
    expect(Number(changed.body.price)).toBe(20)
    expect((await admin(`/api/admin/shipping-methods/${id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await admin(`/api/admin/shipping-methods/${id}`)).status).toBe(404)
  })

  test('gives 404 for missing methods and 400 for bad bodies', async () => {
    expect((await admin('/api/admin/shipping-methods/999999999', { method: 'PATCH', body: { price: '1' } })).status).toBe(404)
    expect((await admin('/api/admin/shipping-methods/999999999', { method: 'DELETE' })).status).toBe(404)
    expect((await admin('/api/admin/shipping-methods', { method: 'POST', body: { name: 'x', price: 'free' } })).status).toBe(400)
    expect((await admin('/api/admin/settings/tax', { method: 'PATCH', body: { defaultRate: '-5' } })).status).toBe(400)
    expect((await admin('/api/admin/settings/loyalty', { method: 'PATCH', body: { expiresAfterInDays: 0 } })).status).toBe(400)
  })

  test('settings are for admins only', async () => {
    expect((await client()('/api/admin/settings/tax')).status).toBe(401)
    expect((await client(await createUser(db, null))('/api/admin/settings/loyalty', { method: 'PATCH', body: { isEnabled: true } })).status).toBe(403)
  })
})
