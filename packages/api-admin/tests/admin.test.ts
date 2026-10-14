import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, describe, expect, test } from 'vitest'
import { sessions, users } from '../../auth/server/db/schema'

const url = process.env.TEST_POSTGRES_URL

describe.skipIf(!url)('admin API access', async () => {
  // The built server reads these
  process.env.NUXT_POSTGRES_URL = url
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'
  await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)) })

  const pool = new pg.Pool({ connectionString: url })
  const db = drizzle(pool)
  afterAll(() => pool.end())

  // A signed-in user; returns their session token, sent as a Bearer token
  const signIn = async (role: string | null) => {
    const userId = randomUUID()
    await db.insert(users).values({
      id: userId,
      name: 'Test',
      email: `${userId}@example.com`,
      role,
    })
    const token = randomUUID()
    await db.insert(sessions).values({
      id: randomUUID(),
      token,
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    return token
  }

  const get = (path: string, token?: string) =>
    fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} })

  test('admin routes need a signed-in admin', async () => {
    expect((await get('/api/admin/products')).status).toBe(401)
    expect((await get('/api/admin/products', await signIn(null))).status).toBe(403)

    const admin = await get('/api/admin/products', await signIn('admin'))
    expect(admin.status).toBe(200)
    expect(await admin.json()).toHaveProperty('pagination')
  })

  test('another spelling of the path does not skip the check', async () => {
    for (const path of ['/api//admin/products', '/api/%61dmin/products', '/API/admin/products']) {
      expect((await get(path)).status).toBe(401)
    }
  })

  test('Better Auth answers on /api/auth with the role', async () => {
    const token = await signIn('admin')
    const response = await get('/api/auth/get-session', token)

    expect(response.status).toBe(200)
    expect((await response.json()).user.role).toBe('admin')
  })
})
