import { fetch } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { users } from '../../auth/server/db/schema'
import { startFakeS3 } from '../../api-admin/tests/fake-s3'
import { createUser, setupApi, url } from './helpers'

const png = () => new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])

describe.skipIf(!url)('profile photo', async () => {
  const bucket = await startFakeS3()
  const db = await setupApi()

  const upload = async (bytes: Uint8Array<ArrayBuffer>, token?: string) => {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'me.png')
    const response = await fetch('/api/store/profile/photo', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
  const image = async (userId: string) => (await db.select().from(users).where(eq(users.id, userId)))[0]!.image

  test('stores the photo under profiles/ and makes it the account image', async () => {
    const { userId, token } = await createUser(db)

    const first = await upload(png(), token)
    expect(first).toEqual({ status: 200, body: { url: `http://cdn.test/profiles/${userId}.png` } })
    expect(new Uint8Array(bucket.objects.get(`profiles/${userId}.png`)!.body)).toEqual(png())
    expect(await image(userId)).toBe(first.body.url)

    // A new photo gets a new key, so the old URL is not shown from a cache
    const second = await upload(png(), token)
    expect(second.body.url).toBe(`http://cdn.test/profiles/${userId}-1.png`)
    expect(await image(userId)).toBe(second.body.url)
  })

  test('needs a signed-in buyer and an image', async () => {
    expect((await upload(png())).status).toBe(401)
    const { userId, token } = await createUser(db)
    const notImage = await upload(new Uint8Array([1, 2, 3, 4]), token)
    expect(notImage.status).toBe(415)
    expect(notImage.body.message).toBe('Photos must be JPEG, PNG or WebP.')
    expect(await image(userId)).toBeNull()
  })
})
