import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll } from 'vitest'
import * as librarySchema from '@awecommerce/service/core/db/pg/schema'
import * as authSchema from '../../auth/server/db/schema'
import { startFakeSes } from '../../api-store/tests/fake-ses'
import { startFakeS3 } from './fake-s3'

export const url = process.env.TEST_POSTGRES_URL

const schema = { ...librarySchema, ...authSchema }

// Builds and starts the layer as a Nuxt app, and connects the tests to its
// database. Call at the top of a describe block.
export const setupAdminApi = async () => {
  // The built server reads these
  process.env.NUXT_POSTGRES_URL = url
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'
  // Signs the links in order emails
  process.env.ORDER_HASH_SECRET = 'test-secret'
  ses = await startFakeSes()
  bucket = await startFakeS3()
  await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)) })

  const pool = new pg.Pool({ connectionString: url })
  afterAll(() => pool.end())
  return drizzle(pool, { schema })
}

export type TestDb = Awaited<ReturnType<typeof setupAdminApi>>

let ses: Awaited<ReturnType<typeof startFakeSes>> | undefined
let bucket: Awaited<ReturnType<typeof startFakeS3>> | undefined
// The product image bucket the server uploads to (see fake-s3.ts)
export const fakeBucket = () => bucket!
// The mails the server sent to this address through SES (see fake-ses.ts)
export const mailsTo = (email: string) => ses!.to(email)

let count = 0
export const unique = (prefix: string) => `${prefix}-${Date.now()}-${++count}`

// A signed-in user; returns their session token, sent as a Bearer token
export const createUser = async (db: TestDb, role: string | null, email?: string) => {
  return (await createSignedInUser(db, role, email)).token
}

// Like createUser, with the user's id too
export const createSignedInUser = async (db: TestDb, role: string | null, email?: string) => {
  const userId = randomUUID()
  await db.insert(authSchema.users).values({ id: userId, name: 'Staff', email: email ?? `${userId}@example.com`, role })
  const token = randomUUID()
  await db.insert(authSchema.sessions).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return { userId, token }
}

// JSON requests, signed in with the token when given
export const client = (token?: string) =>
  async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
