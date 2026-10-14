import { describe, expect, test } from 'vitest'
import { client, createUser, setupAdminApi, unique, url } from './helpers'

describe.skipIf(!url)('admin catalog API', async () => {
  const db = await setupAdminApi()
  const admin = client(await createUser(db, 'admin'))

  const newProduct = (fields: Record<string, unknown> = {}) => {
    const slug = unique('admin-product')
    return { name: slug, slug, sku: slug, price: '25', inventoryCost: '10', ...fields }
  }

  test('creates, shows, changes and publishes a product', async () => {
    const created = await admin('/api/admin/products', { method: 'POST', body: newProduct() })
    expect(created.status).toBe(200)
    expect(created.body.status).toBe('Draft')
    const { id } = created.body

    const shown = await admin(`/api/admin/products/${id}`)
    expect(shown.body.variants).toHaveLength(1)
    // Staff see costs
    expect(Number(shown.body.variants[0].inventoryCost)).toBe(10)

    const changed = await admin(`/api/admin/products/${id}`, {
      method: 'PATCH',
      body: {
        status: 'Published',
        isFeatured: true,
        images: ['a.jpg', 'b.jpg'],
        customFields: [{ label: 'Name', required: true, maxLength: 10 }],
      },
    })
    expect(changed.status).toBe(200)
    const after = (await admin(`/api/admin/products/${id}`)).body
    expect(after).toMatchObject({ status: 'Published', isFeatured: true, images: ['a.jpg', 'b.jpg'] })
    expect(after.customFields).toEqual([{ label: 'Name', required: true, maxLength: 10 }])
  })

  test('lists drafts, inactive products and products under inactive brands', async () => {
    const prefix = unique('admin-list')
    const brand = (await admin('/api/admin/brands', { method: 'POST', body: { name: unique('b'), slug: unique('b'), isActive: false } })).body
    const draft = (await admin('/api/admin/products', { method: 'POST', body: newProduct({ name: `${prefix}-draft` }) })).body
    const inactive = (await admin('/api/admin/products', { method: 'POST', body: newProduct({ name: `${prefix}-inactive`, isActive: false }) })).body
    const hiddenBrand = (await admin('/api/admin/products', { method: 'POST', body: newProduct({ name: `${prefix}-brand`, brandId: brand.id, status: 'Published' }) })).body

    const all = (await admin(`/api/admin/products?q=${prefix}`)).body
    expect(all.results.map((p: any) => p.id).sort()).toEqual([draft.id, inactive.id, hiddenBrand.id].sort())
    expect((await admin(`/api/admin/products?q=${prefix}&status=Published`)).body.results.map((p: any) => p.id)).toEqual([hiddenBrand.id])
    expect((await admin(`/api/admin/products?q=${prefix}&active=false`)).body.results.map((p: any) => p.id)).toEqual([inactive.id])
    expect((await admin(`/api/admin/products?q=${prefix}&brands=${brand.id}`)).body.results.map((p: any) => p.id)).toEqual([hiddenBrand.id])
  })

  test('adds, changes and deletes variants, and renames their options', async () => {
    const product = (await admin('/api/admin/products', { method: 'POST', body: newProduct() })).body
    const sku = unique('sku')

    const added = await admin(`/api/admin/products/${product.id}/variants`, {
      method: 'POST',
      body: { sku, price: '30', options: { Size: 'L' } },
    })
    expect(added.status).toBe(200)
    const changed = await admin(`/api/admin/variants/${added.body.id}`, { method: 'PATCH', body: { price: '35', isActive: false } })
    expect(Number(changed.body.price)).toBe(35)
    expect(changed.body.isActive).toBe(false)

    const detail = (await admin(`/api/admin/products/${product.id}`)).body
    const size = detail.options.find((o: any) => o.name === 'Size')
    expect((await admin(`/api/admin/options/${size.id}`, { method: 'PATCH', body: { name: 'Fit' } })).body.name).toBe('Fit')
    expect((await admin(`/api/admin/option-values/${size.values[0].id}`, { method: 'PATCH', body: { value: 'Large' } })).body.value).toBe('Large')
    const variant = (await admin(`/api/admin/products/${product.id}`)).body.variants.find((v: any) => v.id === added.body.id)
    expect(variant.options).toEqual([{ name: 'Fit', value: 'Large' }])

    expect((await admin(`/api/admin/variants/${added.body.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await admin(`/api/admin/products/${product.id}`)).body.variants).toHaveLength(1)
  })

  test('manages brands, categories and product classes', async () => {
    for (const [path, extra] of [
      ['/api/admin/brands', { order: 2 }],
      ['/api/admin/categories', {}],
      ['/api/admin/product-classes', { taxRate: '13' }],
    ] as const) {
      const name = unique('entity')
      const created = await admin(path, { method: 'POST', body: { name, slug: name, ...extra } })
      expect(created.status).toBe(200)
      const { id } = created.body
      expect((await admin(`${path}/${id}`)).body.name).toBe(name)
      expect((await admin(`${path}/${id}`, { method: 'PATCH', body: { isActive: false } })).body.isActive).toBe(false)
      const listed = (await admin(`${path}?q=${name}&active=false`)).body
      expect(listed.results.map((r: any) => r.id)).toEqual([id])
      expect((await admin(`${path}/${id}`, { method: 'DELETE' })).status).toBe(200)
      expect((await admin(`${path}/${id}`)).status).toBe(404)
    }
  })

  test('refuses duplicates, deleting what is in use, and missing references', async () => {
    const product = newProduct()
    await admin('/api/admin/products', { method: 'POST', body: product })
    const duplicate = await admin('/api/admin/products', { method: 'POST', body: { ...product, sku: unique('sku') } })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.data.code).toBe('AlreadyExists')
    expect(duplicate.body.message).toContain('slug')

    const name = unique('parent')
    const parent = (await admin('/api/admin/categories', { method: 'POST', body: { name, slug: name } })).body
    const child = unique('child')
    await admin('/api/admin/categories', { method: 'POST', body: { name: child, slug: child, parentId: parent.id } })
    const inUse = await admin(`/api/admin/categories/${parent.id}`, { method: 'DELETE' })
    expect(inUse.status).toBe(409)
    expect(inUse.body.data.code).toBe('InUse')

    const missing = await admin('/api/admin/products', { method: 'POST', body: newProduct({ categoryId: 999999999 }) })
    expect(missing.status).toBe(422)
    expect(missing.body.data.code).toBe('MissingReference')
  })

  test('list rows carry a variant summary and sort by name', async () => {
    const prefix = unique('admin-summary')
    const b = (await admin('/api/admin/products', { method: 'POST', body: newProduct({ name: `${prefix}-b`, stockQuantity: 3 }) })).body
    const a = (await admin('/api/admin/products', { method: 'POST', body: newProduct({ name: `${prefix}-a` }) })).body

    const rows = (await admin(`/api/admin/products?q=${prefix}&sortBy=nameAsc`)).body.results
    expect(rows.map((r: any) => r.id)).toEqual([a.id, b.id])
    expect(rows[1]).toMatchObject({ variantCount: 1, totalStock: 3 })
    expect(rows[1].singleVariant).toMatchObject({ id: b.variants[0].id, stockQuantity: 3 })
  })

  test('changes several products at once, or none', async () => {
    const first = (await admin('/api/admin/products', { method: 'POST', body: newProduct() })).body
    const second = (await admin('/api/admin/products', { method: 'POST', body: newProduct() })).body

    const published = await admin('/api/admin/products/bulk', {
      method: 'POST',
      body: { ids: [first.id, second.id], changes: { status: 'Published' } },
    })
    expect(published.body.updated.sort()).toEqual([first.id, second.id].sort())
    expect((await admin(`/api/admin/products/${second.id}`)).body.status).toBe('Published')

    const missing = await admin('/api/admin/products/bulk', {
      method: 'POST',
      body: { ids: [first.id, 999999999], changes: { isActive: false } },
    })
    expect(missing.status).toBe(404)
    expect((await admin(`/api/admin/products/${first.id}`)).body.isActive).toBe(true)
    expect((await admin('/api/admin/products/bulk', { method: 'POST', body: { ids: [first.id], changes: {} } })).status).toBe(400)
  })

  test('generates variants from options', async () => {
    const product = (await admin('/api/admin/products', { method: 'POST', body: newProduct() })).body

    const generated = await admin(`/api/admin/products/${product.id}/variants/generate`, {
      method: 'POST',
      body: { options: { Size: ['S', 'M'], Colour: ['Red'] } },
    })

    expect(generated.status).toBe(200)
    expect(generated.body).toHaveLength(2)
    expect((await admin(`/api/admin/products/${product.id}`)).body.variants).toHaveLength(2)
    const tooMany = Array.from({ length: 11 }, (_, i) => `v${i}`)
    expect((await admin(`/api/admin/products/${product.id}/variants/generate`, {
      method: 'POST',
      body: { options: { A: tooMany, B: tooMany } },
    })).status).toBe(422)
  })

  test('gives 404 for missing records and 400 for bad bodies', async () => {
    for (const [method, path, body] of [
      ['PATCH', '/api/admin/products/999999999', { name: 'x' }],
      ['DELETE', '/api/admin/products/999999999', undefined],
      ['GET', '/api/admin/products/999999999', undefined],
      ['PATCH', '/api/admin/variants/999999999', { price: '1' }],
      ['DELETE', '/api/admin/option-values/999999999', undefined],
      ['PATCH', '/api/admin/brands/999999999', { name: 'x' }],
    ] as const) {
      expect((await admin(path, { method, body })).status).toBe(404)
    }
    expect((await admin('/api/admin/products', { method: 'POST', body: newProduct({ price: 'twenty' }) })).status).toBe(400)
    expect((await admin('/api/admin/products', { method: 'POST', body: { name: 'no slug' } })).status).toBe(400)
    // Rules the library checks
    const badField = await admin('/api/admin/products', {
      method: 'POST',
      body: newProduct({ customFields: [{ label: 'A', required: true, maxLength: 0 }] }),
    })
    expect(badField.status).toBe(422)
  })
})
