import { describe, expect, test } from 'vitest'
import { client, createUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('admin offers API', async () => {
  const db = await setupAdminApi()
  const admin = client(await createUser(db, 'admin'))

  const post = async (path: string, body: unknown) => {
    const response = await admin(path, { method: 'POST', body })
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    return response.body
  }

  // A range over one new product, a condition and a benefit
  const createParts = async () => {
    const slug = unique('offer-product')
    const product = await post('/api/admin/products', { name: slug, slug, sku: slug, price: '50' })
    const range = await post('/api/admin/offer-ranges', { name: unique('range'), includedProducts: [product.id] })
    const condition = await post('/api/admin/offer-conditions', { rangeId: range.id, type: 'basket_total', value: '100' })
    const benefit = await post('/api/admin/offer-benefits', { name: unique('benefit'), type: 'percentage', value: '10' })
    return { product, range, condition, benefit }
  }

  test('builds a voucher from a range, a condition and a benefit', async () => {
    const { product, range, condition, benefit } = await createParts()
    const code = unique('SAVE').toUpperCase()

    const voucher = await post('/api/admin/offers', {
      name: unique('voucher'),
      type: 'voucher',
      voucherCode: code,
      includeAllUsers: true,
      conditionId: condition.id,
      benefitId: benefit.id,
      endDate: '2030-01-01T00:00:00Z',
      overallLimit: 100,
    })

    const shown = (await admin(`/api/admin/offers/${voucher.id}`)).body
    expect(shown).toMatchObject({ voucherCode: code, usageCount: 0, overallLimit: 100 })
    expect(shown.condition).toMatchObject({ id: condition.id, rangeId: range.id, type: 'basket_total' })
    expect(shown.benefit).toMatchObject({ id: benefit.id, type: 'percentage' })
    expect((await admin(`/api/admin/offer-ranges/${range.id}`)).body.includedProducts).toEqual([
      { id: product.id, name: product.name },
    ])
  })

  test('changes ranges, conditions, benefits and offers', async () => {
    const { range, condition, benefit } = await createParts()
    const offer = await post('/api/admin/offers', {
      name: unique('site'),
      type: 'site',
      conditionId: condition.id,
      benefitId: benefit.id,
    })

    const changedRange = await admin(`/api/admin/offer-ranges/${range.id}`, {
      method: 'PATCH',
      body: { includeAllProducts: true, includedProducts: [] },
    })
    expect(changedRange.body.includeAllProducts).toBe(true)
    expect((await admin(`/api/admin/offer-ranges/${range.id}`)).body.includedProducts).toEqual([])
    expect(
      (await admin(`/api/admin/offer-conditions/${condition.id}`, { method: 'PATCH', body: { type: 'basket_quantity', value: '2' } })).body,
    ).toMatchObject({ type: 'basket_quantity' })
    expect(
      (await admin(`/api/admin/offer-benefits/${benefit.id}`, { method: 'PATCH', body: { type: 'free_shipping', value: '0' } })).body.type,
    ).toBe('free_shipping')
    expect(
      (await admin(`/api/admin/offers/${offer.id}`, { method: 'PATCH', body: { isActive: false, priority: 5 } })).body,
    ).toMatchObject({ isActive: false, priority: 5 })
    expect(
      (await admin(`/api/admin/offers/${offer.id}`, { method: 'PATCH', body: { includedMembershipPlanIds: [1, 2], combinesWithOtherOffers: false } })).body,
    ).toMatchObject({ includedMembershipPlanIds: [1, 2], combinesWithOtherOffers: false })
  })

  test('lists with filters', async () => {
    const { range, condition, benefit } = await createParts()
    const name = unique('listed')
    const voucher = await post('/api/admin/offers', {
      name,
      type: 'voucher',
      voucherCode: unique('CODE'),
      conditionId: condition.id,
      benefitId: benefit.id,
    })

    expect((await admin(`/api/admin/offers?q=${name}&type=voucher`)).body.results.map((o: any) => o.id)).toEqual([voucher.id])
    expect((await admin(`/api/admin/offers?q=${name}&type=site`)).body.results).toEqual([])
    expect((await admin(`/api/admin/offer-conditions?range=${range.id}`)).body.results.map((c: any) => c.id)).toEqual([condition.id])
    expect((await admin(`/api/admin/offer-benefits?q=${benefit.name}&type=percentage`)).body.results.map((b: any) => b.id)).toEqual([benefit.id])
    expect((await admin(`/api/admin/offer-ranges?q=${range.name}`)).body.results.map((r: any) => r.id)).toEqual([range.id])
  })

  test('checks voucher codes', async () => {
    const { condition, benefit } = await createParts()
    const parts = { conditionId: condition.id, benefitId: benefit.id }

    const noCode = await admin('/api/admin/offers', { method: 'POST', body: { name: unique('o'), type: 'voucher', ...parts } })
    expect(noCode.status).toBe(422)
    expect(noCode.body.message).toBe('A voucher needs a voucher code')
    const siteWithCode = await admin('/api/admin/offers', {
      method: 'POST',
      body: { name: unique('o'), type: 'site', voucherCode: unique('CODE'), ...parts },
    })
    expect(siteWithCode.status).toBe(422)

    const code = unique('CODE')
    await post('/api/admin/offers', { name: unique('o'), type: 'voucher', voucherCode: code, ...parts })
    const duplicate = await admin('/api/admin/offers', {
      method: 'POST',
      body: { name: unique('o'), type: 'voucher', voucherCode: code, ...parts },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.data.code).toBe('AlreadyExists')
  })

  test('refuses deleting parts that are still used, in order', async () => {
    const { range, condition, benefit } = await createParts()
    const offer = await post('/api/admin/offers', {
      name: unique('o'),
      type: 'user',
      conditionId: condition.id,
      benefitId: benefit.id,
    })

    for (const path of [
      `/api/admin/offer-ranges/${range.id}`,
      `/api/admin/offer-conditions/${condition.id}`,
      `/api/admin/offer-benefits/${benefit.id}`,
    ]) {
      const refused = await admin(path, { method: 'DELETE' })
      expect(refused.status).toBe(409)
      expect(refused.body.data.code).toBe('InUse')
    }

    for (const path of [
      `/api/admin/offers/${offer.id}`,
      `/api/admin/offer-benefits/${benefit.id}`,
      `/api/admin/offer-conditions/${condition.id}`,
      `/api/admin/offer-ranges/${range.id}`,
    ]) {
      expect((await admin(path, { method: 'DELETE' })).status).toBe(200)
      expect((await admin(path)).status).toBe(404)
    }
  })

  test('gives 404 for missing records and 400 for bad bodies', async () => {
    for (const path of ['offers', 'offer-ranges', 'offer-conditions', 'offer-benefits']) {
      expect((await admin(`/api/admin/${path}/999999999`)).status).toBe(404)
      expect((await admin(`/api/admin/${path}/999999999`, { method: 'DELETE' })).status).toBe(404)
    }
    expect((await admin('/api/admin/offers/999999999', { method: 'PATCH', body: { name: 'x' } })).status).toBe(404)
    expect((await admin('/api/admin/offer-benefits', { method: 'POST', body: { name: 'x', type: 'half_off', value: '1' } })).status).toBe(400)
    expect((await admin('/api/admin/offer-conditions', { method: 'POST', body: { rangeId: 1, type: 'basket_total', value: 'lots' } })).status).toBe(400)
    const { condition, benefit } = await createParts()
    expect(
      (await admin('/api/admin/offers', {
        method: 'POST',
        body: { name: 'x', type: 'site', conditionId: condition.id, benefitId: benefit.id, endDate: 'tomorrow' },
      })).status,
    ).toBe(400)
    // A condition for a range that does not exist
    const missingRange = await admin('/api/admin/offer-conditions', {
      method: 'POST',
      body: { rangeId: 999999999, type: 'basket_total', value: '1' },
    })
    expect(missingRange.status).toBe(422)
  })

  test('saves a whole offer with its parts, lists it by state, and deletes it with them', async () => {
    const slug = unique('offer-product')
    const product = await post('/api/admin/products', { name: slug, slug, sku: slug, price: '50' })
    const name = unique('whole-offer')
    const created = await post('/api/admin/offers/with-parts', {
      name,
      type: 'user',
      includedMembershipPlanIds: [7],
      combinesWithOtherOffers: false,
      products: { all: false, products: [product.id] },
      condition: { type: 'basket_quantity', value: '2' },
      benefit: { type: 'percentage', value: '15', maxAffectedItems: 1 },
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
    })

    const shown = await admin(`/api/admin/offers/${created.id}/with-parts`)
    expect(shown.body).toMatchObject({
      name,
      includedMembershipPlanIds: [7],
      combinesWithOtherOffers: false,
      condition: { type: 'basket_quantity' },
      benefit: { type: 'percentage', maxAffectedItems: 1 },
      products: { all: false, products: [{ id: product.id, name: slug }] },
    })
    const listed = await admin(`/api/admin/offers?q=${name}&state=scheduled`)
    expect(listed.body.results.map((o: any) => [o.id, o.benefit.type])).toEqual([[created.id, 'percentage']])
    expect((await admin(`/api/admin/offers?q=${name}&state=running`)).body.results).toEqual([])

    const changed = await admin(`/api/admin/offers/${created.id}/with-parts`, { method: 'PATCH', body: { products: { all: true }, benefit: { type: 'fixed_amount', value: '5' } } })
    expect(changed.status).toBe(200)
    expect((await admin(`/api/admin/offers/${created.id}/with-parts`)).body).toMatchObject({ products: { all: true }, benefit: { type: 'fixed_amount' } })
    expect((await admin('/api/admin/offers/with-parts', { method: 'POST', body: { name: 'No parts', type: 'site' } })).status).toBe(400)

    expect((await admin(`/api/admin/offers/${created.id}/with-parts`, { method: 'DELETE' })).status).toBe(200)
    expect((await admin(`/api/admin/offers/${created.id}/with-parts`)).status).toBe(404)
    expect((await admin(`/api/admin/offer-conditions/${created.conditionId}`)).status).toBe(404)
  })
})
