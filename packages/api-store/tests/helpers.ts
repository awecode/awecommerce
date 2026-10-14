import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll } from 'vitest'
import * as schema from '@awecommerce/service/core/db/pg/schema'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { sessions, users } from '../../auth/server/db/schema'

export const url = process.env.TEST_POSTGRES_URL

// Builds and starts the layer as a Nuxt app, and connects the tests to its
// database. Call at the top of a describe block.
export const setupApi = async () => {
  // The built server reads these
  process.env.NUXT_POSTGRES_URL = url
  process.env.ORDER_HASH_SECRET = 'test-secret'
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth'
  await setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)) })

  const pool = new pg.Pool({ connectionString: url })
  afterAll(() => pool.end())
  return drizzle(pool, { schema })
}

export type TestDb = Awaited<ReturnType<typeof setupApi>>

let count = 0
export const unique = (prefix: string) => `${prefix}-${Date.now()}-${++count}`

const first = <T>(rows: T[]) => rows[0]!

// Returns the new product's variant id
export const createProduct = async (
  db: TestDb,
  price: string,
  customFields: schema.CustomField[] = [],
) => {
  const slug = unique('store-api')
  const product = await new ProductService(db).create({
    name: slug,
    slug,
    sku: slug,
    price,
    customFields,
    status: 'Published',
  })
  return product.variants[0]!.id
}

// A percentage voucher for the variant's product. Returns the code and offer id.
export const createVoucher = async (db: TestDb, variantId: number, percent: string) => {
  const variant = first(
    await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)),
  )
  const range = first(
    await db
      .insert(schema.offerRanges)
      .values({
        name: unique('range'),
        inclusiveFilter: true,
        includeAllProducts: false,
        includeAllBrands: true,
        includeAllCategories: true,
        includeAllProductClasses: true,
      })
      .returning(),
  )
  await db
    .insert(schema.offerRangeIncludedProducts)
    .values({ rangeId: range.id, productId: variant.productId })
  const condition = first(
    await db
      .insert(schema.offerConditions)
      .values({ rangeId: range.id, type: 'basket_quantity', value: '1' })
      .returning(),
  )
  const benefit = first(
    await db
      .insert(schema.offerBenefits)
      .values({ name: unique('benefit'), type: 'percentage', value: percent })
      .returning(),
  )
  const code = unique('CODE').toUpperCase()
  const offer = first(
    await db
      .insert(schema.offers)
      .values({
        name: code,
        type: 'voucher',
        voucherCode: code,
        includeAllUsers: true,
        conditionId: condition.id,
        benefitId: benefit.id,
      })
      .returning(),
  )
  return { code, offerId: offer.id }
}

// A user with a session. Returns the session token, sent as a Bearer token.
export const createUser = async (db: TestDb) => {
  const userId = randomUUID()
  await db.insert(users).values({ id: userId, name: 'Buyer', email: `${userId}@example.com` })
  const token = randomUUID()
  await db.insert(sessions).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return { userId, token }
}

// A browser: keeps its cookies between requests, and can sign in and out
export const buyer = () => {
  const cookies = new Map<string, string>()
  let token: string | undefined
  const request = async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const [name, ...value] = pair!.split('=')
      cookies.set(name!, value.join('='))
    }
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('awe_cart=')) ?? null
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null, setCookie }
  }
  return Object.assign(request, {
    signIn: (sessionToken: string) => {
      token = sessionToken
    },
    signOut: () => {
      token = undefined
    },
  })
}
