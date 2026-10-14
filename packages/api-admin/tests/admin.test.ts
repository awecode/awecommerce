import { describe, expect, test } from 'vitest'
import { client, createUser, setupAdminApi, url } from './helpers'

describe.skipIf(!url)('admin API access', async () => {
  const db = await setupAdminApi()

  test('admin routes need a signed-in admin', async () => {
    expect((await client()('/api/admin/products')).status).toBe(401)
    expect((await client(await createUser(db, null))('/api/admin/products')).status).toBe(403)

    const admin = await client(await createUser(db, 'admin'))('/api/admin/products')
    expect(admin.status).toBe(200)
    expect(admin.body).toHaveProperty('pagination')
  })

  test('another spelling of the path does not skip the check', async () => {
    for (const path of ['/api//admin/products', '/api/%61dmin/products', '/API/admin/products']) {
      expect((await client()(path)).status).toBe(401)
    }
  })

  test('Better Auth answers on /api/auth with the role', async () => {
    const response = await client(await createUser(db, 'admin'))('/api/auth/get-session')

    expect(response.status).toBe(200)
    expect(response.body.user.role).toBe('admin')
  })
})
