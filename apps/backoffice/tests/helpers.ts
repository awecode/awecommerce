import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createPage, setup } from '@nuxt/test-utils/e2e'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll } from 'vitest'
import * as librarySchema from '@awecommerce/service/core/db/pg/schema'
import * as authSchema from '../../../packages/auth/server/db/schema'
import { startFakeS3 } from '../../../packages/api-admin/tests/fake-s3'

export const url = process.env.TEST_POSTGRES_URL

// Emails that sign in as staff; other emails are customers
export const STAFF_EMAIL = 'staff@example.com'

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

// Builds the backoffice, starts it and a browser, and connects the tests to
// its database. Call at the top of a describe block.
//
// The browser is Playwright's Chromium, or the one at CHROMIUM_PATH (for
// example /usr/bin/chromium) when set.
export const setupBackoffice = async () => {
  const port = await freePort()
  // The built server reads these. Sign-in checks the request's origin against
  // BETTER_AUTH_URL, so it is the test server's own address.
  process.env.NUXT_POSTGRES_URL = url
  process.env.BETTER_AUTH_URL = `http://127.0.0.1:${port}`
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'
  process.env.NUXT_AUTH_ADMIN_EMAILS = STAFF_EMAIL
  bucket = await startFakeS3()
  await setup({
    rootDir: fileURLToPath(new URL('..', import.meta.url)),
    port,
    browser: true,
    browserOptions: {
      type: 'chromium',
      launch: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    },
  })

  const pool = new pg.Pool({ connectionString: url })
  afterAll(() => pool.end())
  return drizzle(pool, { schema: { ...librarySchema, ...authSchema } })
}

export type TestDb = Awaited<ReturnType<typeof setupBackoffice>>

let bucket: Awaited<ReturnType<typeof startFakeS3>> | undefined
// The product image bucket the server uploads to (public URL http://cdn.test/)
export const fakeBucket = () => bucket!

// Signs a new browser page in as `email` through the emailed link's confirm
// page: the token is stored the way Better Auth's magic link plugin stores it,
// then the page's Continue button verifies it.
export const signedInPage = async (db: TestDb, email: string, colorScheme: 'light' | 'dark' = 'light') => {
  const token = randomUUID().replaceAll('-', '')
  await db.insert(authSchema.verifications).values({
    id: randomUUID(),
    identifier: `magic-link:${createHash('sha256').update(token).digest('base64url')}`,
    value: JSON.stringify({ type: 'magic-link', email }),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })
  const page = await createPage(undefined, { colorScheme })
  await page.goto(`${process.env.BETTER_AUTH_URL}/auth/confirm#token=${token}`)
  await page.getByRole('button', { name: 'Continue' }).click()
  return page
}
