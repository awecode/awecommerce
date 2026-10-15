import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '../../../core/errors'
import { Database } from '../../types'
import {
  membershipPlans,
  memberships,
  membershipTerms,
  NewMembershipPlan,
  NewMembershipTerm,
} from '../schemas'

type GrantOptions = {
  userId: string
  planId: number
  months: number
  // What the buyer paid, when bought
  pricePaid?: string | null
  // The order that bought it, or the staff user who granted it
  orderId?: number
  grantedBy?: string
}

// Memberships: plans (tiers grouped by program), the product variants that
// sell them (terms), and each person's memberships.
//
// Granting follows the plan's program:
// - A plan ranked above every current membership in the program replaces
//   them: the running one ends now, those waiting to start are cancelled,
//   and the new one starts now.
// - The same plan, or a lower one, starts when the program's last
//   membership ends, so renewing early extends it.
class MembershipService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async createPlan(data: NewMembershipPlan) {
    const [plan] = await this.db.insert(membershipPlans).values(data).returning()
    return plan
  }

  async updatePlan(id: number, data: Partial<NewMembershipPlan>) {
    const [plan] = await this.db
      .update(membershipPlans)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(membershipPlans.id, id))
      .returning()
    if (!plan) {
      throw new NotFoundError(`Membership plan not found: ${id}`)
    }
    return plan
  }

  async getPlan(id: number) {
    return (
      (await this.db.query.membershipPlans.findFirst({
        where: eq(membershipPlans.id, id),
        with: { terms: true },
      })) ?? null
    )
  }

  async listPlans() {
    return await this.db.query.membershipPlans.findMany({
      with: { terms: true },
      orderBy: [membershipPlans.program, desc(membershipPlans.rank)],
    })
  }

  // Makes the variant sell the plan for that many months
  async addTerm(data: NewMembershipTerm) {
    if (!Number.isInteger(data.months) || data.months < 1) {
      throw new ValidationError('A term is at least 1 month')
    }
    const [term] = await this.db.insert(membershipTerms).values(data).returning()
    return term
  }

  async removeTerm(id: number) {
    await this.db.delete(membershipTerms).where(eq(membershipTerms.id, id))
  }

  // The terms these variants sell, with their plans, by variant id
  async termsForVariants(variantIds: number[]) {
    const terms = variantIds.length
      ? await this.db.query.membershipTerms.findMany({
          where: inArray(membershipTerms.variantId, variantIds),
          with: { plan: true },
        })
      : []
    return new Map(terms.map((term) => [term.variantId, term]))
  }

  // The memberships that count now: active, started and not ended. At most
  // one per program, unless granted around these rules.
  async activeMemberships(userId: string) {
    const now = new Date().toISOString()
    return await this.db.query.memberships.findMany({
      where: and(
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
        lte(memberships.startsAt, now),
        gt(memberships.endsAt, now),
      ),
      with: { plan: true },
      orderBy: desc(memberships.endsAt),
    })
  }

  async grant(options: GrantOptions) {
    const { userId, planId, months } = options
    if (!Number.isInteger(months) || months < 1) {
      throw new ValidationError('A membership is at least 1 month')
    }
    return await this.db.transaction(async (tx) => {
      const plan = await tx.query.membershipPlans.findFirst({
        where: eq(membershipPlans.id, planId),
      })
      if (!plan) {
        throw new NotFoundError(`Membership plan not found: ${planId}`)
      }
      // One grant at a time per person and program
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`membership:${userId}:${plan.program}`}))`)
      const now = new Date().toISOString()
      // The program's memberships that have not ended: running or waiting
      const current = await tx
        .select({
          id: memberships.id,
          started: sql<boolean>`${memberships.startsAt} <= ${now}`,
          endsAt: memberships.endsAt,
          rank: membershipPlans.rank,
        })
        .from(memberships)
        .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.status, 'active'),
            eq(membershipPlans.program, plan.program),
            gt(memberships.endsAt, now),
          ),
        )

      let startsAt = now
      if (current.length && current.every((row) => row.rank < plan.rank)) {
        for (const row of current) {
          if (row.started) {
            await tx.update(memberships).set({ endsAt: now }).where(eq(memberships.id, row.id))
          } else {
            await tx
              .update(memberships)
              .set({ status: 'cancelled', cancelledAt: now, cancellationReason: `Replaced by ${plan.name}` })
              .where(eq(memberships.id, row.id))
          }
        }
      } else if (current.length) {
        const [{ latest }] = await tx
          .select({ latest: sql<string>`max(${memberships.endsAt})` })
          .from(memberships)
          .where(inArray(memberships.id, current.map((row) => row.id)))
        startsAt = latest
      }

      const [membership] = await tx
        .insert(memberships)
        .values({
          userId,
          planId,
          months,
          pricePaid: options.pricePaid ?? null,
          orderId: options.orderId,
          grantedBy: options.grantedBy,
          startsAt,
          endsAt: sql`${startsAt}::timestamptz + make_interval(months => ${months})`,
        })
        .returning()
      return membership
    })
  }

  // Ends it now (or before it starts). Throws for one already cancelled.
  async cancel(id: number, reason: string) {
    const [membership] = await this.db
      .update(memberships)
      .set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancellationReason: reason })
      .where(and(eq(memberships.id, id), eq(memberships.status, 'active')))
      .returning()
    if (!membership) {
      const exists = await this.db.query.memberships.findFirst({ where: eq(memberships.id, id) })
      if (!exists) {
        throw new NotFoundError(`Membership not found: ${id}`)
      }
      throw new ValidationError(`Membership is already cancelled: ${id}`)
    }
    return membership
  }

  // Cancels what the order bought, for example when the order is cancelled or
  // refunded. Returns the memberships it cancelled.
  async cancelForOrder(orderId: number, reason: string) {
    return await this.db
      .update(memberships)
      .set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancellationReason: reason })
      .where(and(eq(memberships.orderId, orderId), eq(memberships.status, 'active')))
      .returning()
  }

  // What the order bought, with the plans
  async forOrder(orderId: number) {
    return await this.db.query.memberships.findMany({
      where: eq(memberships.orderId, orderId),
      with: { plan: true },
    })
  }

  // Every membership the person had, newest first
  async history(userId: string) {
    return await this.db.query.memberships.findMany({
      where: eq(memberships.userId, userId),
      with: { plan: true },
      orderBy: [desc(memberships.startsAt), desc(memberships.id)],
    })
  }
}

export { MembershipService }
