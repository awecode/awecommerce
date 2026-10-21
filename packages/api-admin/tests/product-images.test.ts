import { fetch } from '@nuxt/test-utils/e2e'
import { describe, expect, test } from 'vitest'
import { createUser, fakeBucket, setupAdminApi, unique, url } from './helpers'

// Just enough of each format for its signature
const png = () => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])
const jpeg = () => new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4])
const webp = () => new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))

describe.skipIf(!url)('product image upload', async () => {
  const db = await setupAdminApi()
  const staffToken = await createUser(db, 'admin')

  const upload = async (
    file: { bytes: Uint8Array<ArrayBuffer>; type?: string; name?: string },
    slug: string,
    token: string | undefined = staffToken,
    folder?: string,
  ) => {
    const form = new FormData()
    form.append('slug', slug)
    if (folder) form.append('folder', folder)
    form.append('file', new Blob([file.bytes], { type: file.type ?? 'image/png' }), file.name ?? 'photo.png')
    const response = await fetch('/api/admin/product-images', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  test('is for staff only', async () => {
    expect((await upload({ bytes: png() }, unique('mug'), '')).status).toBe(401)
    const customer = await createUser(db, null)
    expect((await upload({ bytes: png() }, unique('mug'), customer)).status).toBe(403)
  })

  test('stores the image under products/<slug>, and numbers a clash instead of overwriting', async () => {
    const slug = unique('mug')
    const first = await upload({ bytes: png(), name: 'IMG_0042.PNG' }, slug)
    expect(first).toEqual({
      status: 200,
      body: { key: `products/${slug}.png`, url: `http://cdn.test/products/${slug}.png` },
    })
    const stored = fakeBucket().objects.get(`products/${slug}.png`)!
    expect(new Uint8Array(stored.body)).toEqual(png())
    expect(stored.headers['content-type']).toBe('image/png')
    expect(stored.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(stored.headers['x-amz-acl']).toBeUndefined()

    expect((await upload({ bytes: png() }, slug)).body.key).toBe(`products/${slug}-1.png`)
    expect((await upload({ bytes: png() }, slug)).body.key).toBe(`products/${slug}-2.png`)
    // Another type is another key
    expect((await upload({ bytes: jpeg(), type: 'image/jpeg' }, slug)).body.key).toBe(`products/${slug}.jpg`)
    expect((await upload({ bytes: webp(), type: 'image/webp' }, slug)).body.key).toBe(`products/${slug}.webp`)
    expect(new Uint8Array(fakeBucket().objects.get(`products/${slug}.png`)!.body)).toEqual(png())
  })

  test('refuses other types, whatever they claim to be, and files over 8 MB', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const asPng = await upload({ bytes: svg, type: 'image/png', name: 'logo.png' }, unique('logo'))
    expect(asPng.status).toBe(415)
    expect(asPng.body.message).toBe('Images must be JPEG, PNG or WebP.')
    expect((await upload({ bytes: new TextEncoder().encode('GIF89a'), type: 'image/gif' }, unique('gif'))).status).toBe(415)

    const big = new Uint8Array(8 * 1024 * 1024 + 1)
    big.set(png())
    const tooBig = await upload({ bytes: big }, unique('big'))
    expect(tooBig.status).toBe(413)
    expect(tooBig.body.message).toBe('Images can be up to 8 MB.')
    // Exactly 8 MiB is fine
    const max = new Uint8Array(8 * 1024 * 1024)
    max.set(png())
    expect((await upload({ bytes: max }, unique('max'))).status).toBe(200)
  })

  test('needs a slug of lowercase letters, numbers and hyphens', async () => {
    for (const slug of ['', 'Mug', 'mug/blue', '../mug', 'mug blue', '-mug']) {
      const response = await upload({ bytes: png() }, slug)
      expect(response.status).toBe(422)
      expect(response.body.message).toBe('The slug can only have lowercase letters, numbers and hyphens.')
    }
  })

  test('stores under the given folder (offers, brands, categories), and refuses unknown folders', async () => {
    for (const folder of ['offers', 'brands', 'categories'] as const) {
      const slug = unique(folder)
      const response = await upload({ bytes: png() }, slug, staffToken, folder)
      expect(response).toEqual({
        status: 200,
        body: { key: `${folder}/${slug}.png`, url: `http://cdn.test/${folder}/${slug}.png` },
      })
    }
    const bad = await upload({ bytes: png() }, unique('x'), staffToken, 'root')
    expect(bad.status).toBe(422)
    expect(bad.body.message).toBe('Folder must be one of: products, offers, brands, categories.')
  })

  test('says so when the bucket fails, and stores nothing', async () => {
    const slug = unique('broken')
    fakeBucket().failWhen((key) => key.startsWith(`products/${slug}`))
    const response = await upload({ bytes: png() }, slug)
    fakeBucket().failWhen(() => false)

    expect(response.status).toBe(502)
    expect(response.body.message).toMatch(/^The image could not be stored\./)
    expect(fakeBucket().objects.has(`products/${slug}.png`)).toBe(false)
  })
})
