import { and, asc, desc, eq, getTableColumns, gt, ilike, inArray, lte, or, SQL, sql } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '../../../core/errors'
import { Exact, paginate, PaginationArgs } from '../../../core/pagination'
import { Database } from '../../types'
import { products, productVariants } from '../../product/schemas'
import { listedProduct } from '../../product/services/product'
import {
  membershipPlans,
  memberships,
  MembershipPlan,
  membershipTerms,
  NewMembershipPlan,
  NewMembershipTerm,
} from '../schemas'

interface PlanFilter {
  // Part of the name, slug or program
  q?: string
  isActive?: boolean
  // Only these plans
  ids?: number[]
  pagination?: PaginationArgs
}

// A membership's state now: active (counts), upcoming (waits for its start),
// ended, or cancelled
export type MembershipState = 'active' | 'upcoming' | 'ended' | 'cancelled'

interface MembershipFilter {
  userId?: string
  // Members whose id is one of these (such as the users matching a search)
  userIds?: string[]
  planId?: number
  state?: MembershipState
  pagination?: PaginationArgs
}

const membershipState = sql<MembershipState>`CASE
  WHEN ${memberships.status} = 'cancelled' THEN 'cancelled'
  WHEN ${memberships.startsAt} > now() THEN 'upcoming'
  WHEN ${memberships.endsAt} <= now() THEN 'ended'
  ELSE 'active' END`

// The same state as the SQL above, for a membership already read
const stateAt = (m: { status: 'active' | 'cancelled'; startsAt: string; endsAt: string }, now: number): MembershipState =>
  m.status === 'cancelled'
    ? 'cancelled'
    : new Date(m.startsAt).getTime() > now
      ? 'upcoming'
      : new Date(m.endsAt).getTime() <= now
        ? 'ended'
        : 'active'

type Memberships = Awaited<ReturnType<MembershipService['history']>>

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

  // Throws NotFoundError when missing, and a database error (foreign key)
  // while memberships use it; its terms go with it
  async deletePlan(id: number) {
    const [plan] = await this.db.delete(membershipPlans).where(eq(membershipPlans.id, id)).returning()
    if (!plan) {
      throw new NotFoundError(`Membership plan not found: ${id}`)
    }
    return plan
  }

  // The plan with its terms, each with the variant and product that sell it
  async getPlan(id: number) {
    return (
      (await this.db.query.membershipPlans.findFirst({
        where: eq(membershipPlans.id, id),
        with: {
          terms: {
            with: { variant: { with: { product: { columns: { id: true, name: true } } } } },
            orderBy: asc(membershipTerms.months),
          },
        },
      })) ?? null
    )
  }

  // By program, then highest rank first, each with its number of terms
  async listPlans<F extends PlanFilter = {}>(filter?: Exact<F, PlanFilter>) {
    const where: SQL[] = []
    if (filter?.q) {
      const like = `%${filter.q}%`
      where.push(or(ilike(membershipPlans.name, like), ilike(membershipPlans.slug, like), ilike(membershipPlans.program, like))!)
    }
    if (filter?.isActive !== undefined) {
      where.push(eq(membershipPlans.isActive, filter.isActive))
    }
    if (filter?.ids) {
      where.push(filter.ids.length ? inArray(membershipPlans.id, filter.ids) : sql`false`)
    }
    const query = this.db
      .select({
        id: membershipPlans.id,
        name: membershipPlans.name,
        slug: membershipPlans.slug,
        program: membershipPlans.program,
        rank: membershipPlans.rank,
        description: membershipPlans.description,
        isActive: membershipPlans.isActive,
        // Written out: in a one-table select, Drizzle leaves column names unqualified
        termCount: sql<number>`(SELECT count(*)::int FROM "membership_term" WHERE "membership_term"."planId" = "membership_plan"."id")`,
      })
      .from(membershipPlans)
      .where(and(...where))
      .orderBy(asc(membershipPlans.program), desc(membershipPlans.rank), asc(membershipPlans.name))
      .$dynamic()
    return await paginate(
      filter as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(membershipPlans, and(...where)),
    )
  }

  // Memberships, latest start first, each with its plan and `state`
  async list<F extends MembershipFilter = {}>(filter?: Exact<F, MembershipFilter>) {
    const where: SQL[] = []
    if (filter?.userId) where.push(eq(memberships.userId, filter.userId))
    if (filter?.userIds) where.push(inArray(memberships.userId, filter.userIds.length ? filter.userIds : ['']))
    if (filter?.planId) where.push(eq(memberships.planId, filter.planId))
    if (filter?.state) where.push(sql`${membershipState} = ${filter.state}`)
    return await paginate(
      filter as F | undefined,
      (page) =>
        this.db.query.memberships.findMany({
          where: and(...where),
          with: { plan: { columns: { id: true, name: true, program: true, rank: true } } },
          extras: { state: membershipState.as('state') },
          orderBy: [desc(memberships.startsAt), desc(memberships.id)],
          ...page,
        }),
      () => this.db.$count(memberships, and(...where)),
    )
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

  // The terms these variants sell, with their plans, by variant id. One join.
  async termsForVariants(variantIds: number[]) {
    // An empty list rather than an early `new Map()`, which would type every
    // lookup as any
    const terms = variantIds.length
      ? await this.db
          .select({
            ...getTableColumns(membershipTerms),
            plan: getTableColumns(membershipPlans),
          })
          .from(membershipTerms)
          .innerJoin(membershipPlans, eq(membershipPlans.id, membershipTerms.planId))
          .where(inArray(membershipTerms.variantId, variantIds))
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

  // The plan ids of the person's active memberships, without loading the plans
  async activePlanIds(userId: string) {
    const now = new Date().toISOString()
    const rows = await this.db
      .select({ planId: memberships.planId })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          lte(memberships.startsAt, now),
          gt(memberships.endsAt, now),
        ),
      )
    return rows.map((row) => row.planId)
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

  // Each plan the person holds now, waits for, or held until recently (ended
  // in the last `endedWithinDays` days), from their memberships that were not
  // cancelled: `state` (active, upcoming or ended), when the running or next
  // one starts, and when the last one ends. Latest end first.
  async currentPlans(userId: string, { endedWithinDays = 90 } = {}) {
    return this.currentFrom(await this.history(userId), endedWithinDays)
  }

  private currentFrom(rows: Memberships, endedWithinDays = 90) {
    const now = Date.now()
    const since = now - endedWithinDays * 86_400_000
    const byPlan = new Map<number, Memberships>()
    for (const membership of rows) {
      if (membership.status === 'cancelled') continue
      byPlan.set(membership.planId, [...(byPlan.get(membership.planId) ?? []), membership])
    }
    const plans = []
    for (const rows of byPlan.values()) {
      const time = (value: string) => new Date(value).getTime()
      const running = rows.find((m) => time(m.startsAt) <= now && time(m.endsAt) > now)
      const next = rows.filter((m) => time(m.startsAt) > now).sort((a, b) => time(a.startsAt) - time(b.startsAt))[0]
      const last = rows.reduce((latest, m) => (time(m.endsAt) > time(latest.endsAt) ? m : latest))
      const state = running ? 'active' : next ? 'upcoming' : 'ended'
      if (state === 'ended' && time(last.endsAt) < since) continue
      plans.push({
        plan: last.plan,
        state: state as 'active' | 'upcoming' | 'ended',
        startsAt: (running ?? next ?? last).startsAt,
        endsAt: last.endsAt,
      })
    }
    return plans.sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
  }

  // The terms on sale for these plans: the plan is active, and the variant is
  // active and its product listed. Shortest first, each with its selling
  // price and product slug. One join, including whether the product is listed.
  // With no plan ids, every plan on sale (the memberships page loads them
  // with the person's history, rather than a second round trip).
  async termsOnSale(planIds?: number[]) {
    if (planIds && !planIds.length) return []
    const where: SQL[] = [
      eq(membershipPlans.isActive, true),
      eq(productVariants.isActive, true),
      listedProduct,
    ]
    if (planIds) where.push(inArray(membershipTerms.planId, planIds))
    return await this.db
      .select({
        id: membershipTerms.id,
        planId: membershipTerms.planId,
        months: membershipTerms.months,
        variantId: membershipTerms.variantId,
        // Without the column's 20 trailing zeros (99, not 99.000…), as the
        // relational query this replaced returned it
        price: sql<string | null>`trim_scale(coalesce(${productVariants.discountedPrice}, ${productVariants.price}))`,
        productSlug: products.slug,
      })
      .from(membershipTerms)
      .innerJoin(membershipPlans, eq(membershipPlans.id, membershipTerms.planId))
      .innerJoin(productVariants, eq(productVariants.id, membershipTerms.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(...where))
      .orderBy(asc(membershipTerms.months))
  }

  // The plans the person can join, each with its terms on sale (plans with
  // none are left out): not among their currentPlans, and in a program they
  // hold no running or upcoming membership in, or ranked above it. Such an
  // upgrade starts now and `replaces` that plan. By program, then highest
  // rank first. Without a person (a guest), every plan on sale.
  async plansToJoin(userId?: string) {
    const [rows, plans, terms] = await Promise.all([
      userId ? this.history(userId) : [],
      this.activePlans(),
      this.termsOnSale(),
    ])
    const current = this.currentFrom(rows)
    return this.withTerms(this.joinable(plans, current), terms)
  }

  // What the memberships page shows, from the person's history and the terms
  // on sale in parallel: `current` (their currentPlans, each with the terms
  // on sale to renew), `toJoin` (their plansToJoin), and `history` (every
  // membership, latest start first, with its `state`).
  async overview(userId: string) {
    const [rows, plans, terms] = await Promise.all([
      this.history(userId),
      this.activePlans(),
      this.termsOnSale(),
    ])
    const current = this.currentFrom(rows)
    const joinable = this.joinable(plans, current)
    const now = Date.now()
    return {
      current: current.map((entry) => ({ ...entry, terms: terms.filter((term) => term.planId === entry.plan.id) })),
      toJoin: this.withTerms(joinable, terms),
      history: rows.map(({ plan, ...membership }) => ({
        ...membership,
        plan: { id: plan.id, name: plan.name, program: plan.program, rank: plan.rank },
        state: stateAt(membership, now),
      })),
    }
  }

  private async activePlans() {
    return await this.db.query.membershipPlans.findMany({
      where: eq(membershipPlans.isActive, true),
      orderBy: [asc(membershipPlans.program), desc(membershipPlans.rank), asc(membershipPlans.name)],
    })
  }

  // The plans (as activePlans lists them) the person can join, given their
  // current plans, with the plan each one replaces
  private joinable(plans: MembershipPlan[], current: ReturnType<MembershipService['currentFrom']>) {
    const shown = new Set(current.map((c) => c.plan.id))
    const held = new Map<string, MembershipPlan>()
    for (const { plan, state } of current) {
      const top = held.get(plan.program)
      if (state !== 'ended' && (!top || plan.rank > top.rank)) held.set(plan.program, plan)
    }
    return plans
      .filter((plan) => !shown.has(plan.id) && plan.rank > (held.get(plan.program)?.rank ?? -Infinity))
      .map((plan) => {
        const replaces = held.get(plan.program)
        return { plan, replaces: replaces ? { id: replaces.id, name: replaces.name } : null }
      })
  }

  private withTerms<T extends { plan: MembershipPlan }>(entries: T[], terms: Awaited<ReturnType<MembershipService['termsOnSale']>>) {
    return entries
      .map((entry) => ({ ...entry, terms: terms.filter((term) => term.planId === entry.plan.id) }))
      .filter((entry) => entry.terms.length)
  }

  // Every membership the person had, newest first. One join with the plan,
  // so the account page does not follow up with a second query.
  async history(userId: string) {
    const rows = await this.db
      .select({
        ...getTableColumns(memberships),
        plan: getTableColumns(membershipPlans),
      })
      .from(memberships)
      .innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
      .where(eq(memberships.userId, userId))
      .orderBy(desc(memberships.startsAt), desc(memberships.id))
    return rows
  }
}

export { MembershipService }
