// Runs only against a real Postgres, because PGlite has a single connection and
// cannot run transactions at the same time. Point it at an empty database:
//   TEST_POSTGRES_URL=postgres://user@localhost:5432/awe_test pnpm vitest run loyalty-concurrency
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import * as tables from 'core/db/pg/schema'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { loyaltyLogs, loyaltyPoints } from 'apps/loyalty/schemas'

const url = process.env.TEST_POSTGRES_URL
const CONCURRENCY = 10

describe.skipIf(!url)('loyalty under real concurrency', () => {
  let pool: pg.Pool
  let db: ReturnType<typeof drizzle<typeof tables>>
  let loyaltyService: LoyaltyService
  const runId = Date.now()
  const userId = (name: string) => `${name}-${runId}`

  const redeemedPoints = async (user: string) =>
    (await db.select().from(loyaltyPoints).where(eq(loyaltyPoints.userId, user)))
      .reduce((sum, row) => sum + Number(row.redeemedPoints), 0)

  const logCount = async (user: string, type: 'redeemed' | 'unredeemed') =>
    (
      await db
        .select()
        .from(loyaltyLogs)
        .where(and(eq(loyaltyLogs.userId, user), eq(loyaltyLogs.type, type)))
    ).length

  const settle = async (calls: Promise<unknown>[]) => {
    const results = await Promise.allSettled(calls)
    const rejected = results.filter((r) => r.status === 'rejected')
    return {
      fulfilled: results.length - rejected.length,
      reasons: rejected.map((r) => (r as PromiseRejectedResult).reason.message),
    }
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: CONCURRENCY + 2 })
    db = drizzle(pool, { schema: tables })
    loyaltyService = new LoyaltyService(db)
  })

  afterAll(async () => {
    await pool?.end()
  })

  test('concurrent redeems never spend more points than the user has', async () => {
    const user = userId('concurrent-redeem')
    await db.insert(loyaltyPoints).values({ userId: user, orderId: 1, earnedPoints: '100' })

    const { fulfilled, reasons } = await settle(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        loyaltyService.redeemPoints(user, 100 + i, 20),
      ),
    )

    expect(fulfilled).toBe(5)
    expect(reasons).toEqual(Array(5).fill('Insufficient loyalty points'))
    expect(await redeemedPoints(user)).toBe(100)
    expect(await logCount(user, 'redeemed')).toBe(5)
  })

  test('concurrent redeems across several point rows stay consistent', async () => {
    const user = userId('concurrent-redeem-rows')
    await db.insert(loyaltyPoints).values([
      { userId: user, orderId: 1, earnedPoints: '30' },
      { userId: user, orderId: 2, earnedPoints: '30' },
      { userId: user, orderId: 3, earnedPoints: '40' },
    ])

    const { fulfilled, reasons } = await settle(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        loyaltyService.redeemPoints(user, 100 + i, 25),
      ),
    )

    expect(fulfilled).toBe(4)
    expect(reasons).toEqual(Array(6).fill('Insufficient loyalty points'))
    expect(await redeemedPoints(user)).toBe(100)
  })

  test('concurrent refunds for one order give points back only once', async () => {
    const user = userId('concurrent-unredeem')
    await db.insert(loyaltyPoints).values({ userId: user, orderId: 1, earnedPoints: '100' })
    await loyaltyService.redeemPoints(user, 2, 30)

    const { fulfilled, reasons } = await settle(
      Array.from({ length: 5 }, () => loyaltyService.unredeemPoints(user, 2, 30)),
    )

    expect(fulfilled).toBe(1)
    expect(reasons).toEqual(
      Array(4).fill('Cannot unredeem more points than were redeemed for this order'),
    )
    expect(await redeemedPoints(user)).toBe(0)
    expect(await logCount(user, 'unredeemed')).toBe(1)
  })
})
