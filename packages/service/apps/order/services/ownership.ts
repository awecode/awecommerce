import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { productClasses, products, productVariants } from '../../product/schemas'
import { membershipTerms } from '../../membership/schemas'
import { orderLines, orders } from '../schemas'
import { Database } from '../../types'

// Things a person buys one of: a membership term, or a variant of a product
// whose class is Once per person (an ebook). The cart holds one of each. A
// once variant is owned while a paid order that is not cancelled has it; a
// term never is, since buying it again renews the plan.
class OwnershipService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  // Which of these variants are bought one at a time, and why
  async singleVariants(variantIds: number[]): Promise<Map<number, 'membership' | 'once'>> {
    if (!variantIds.length) return new Map()
    const rows = await this.db
      .select({
        id: productVariants.id,
        oncePerPerson: sql<boolean>`COALESCE(${productClasses.oncePerPerson}, false)`,
        isTerm: sql<boolean>`${membershipTerms.id} IS NOT NULL`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productClasses, eq(productClasses.id, products.productClassId))
      .leftJoin(membershipTerms, eq(membershipTerms.variantId, productVariants.id))
      .where(inArray(productVariants.id, [...new Set(variantIds)]))
    const singles = new Map<number, 'membership' | 'once'>()
    for (const row of rows) {
      if (row.isTerm) singles.set(row.id, 'membership')
      else if (row.oncePerPerson) singles.set(row.id, 'once')
    }
    return singles
  }

  // The once variants of these that the person owns: the latest paid order
  // with each, by variant id. One join (a membership term is never owned).
  // `singles` skips the read when the caller already knows none are once.
  async ownedVariants(
    userId: string | null | undefined,
    variantIds: number[],
    singles?: Map<number, 'membership' | 'once'>,
  ): Promise<Map<number, number>> {
    if (!userId || !variantIds.length) return new Map()
    const once = singles
      ? [...singles].filter(([id, kind]) => kind === 'once' && variantIds.includes(id)).map(([id]) => id)
      : [...new Set(variantIds)]
    if (!once.length) return new Map()
    const rows = await this.db
      .select({ variantId: orderLines.variantId, orderId: sql<number>`MAX(${orders.id})::int` })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(productVariants, eq(productVariants.id, orderLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(productClasses, eq(productClasses.id, products.productClassId))
      .leftJoin(membershipTerms, eq(membershipTerms.variantId, productVariants.id))
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.paymentStatus, 'Paid'),
          ne(orders.status, 'Cancelled'),
          inArray(orderLines.variantId, once),
          eq(productClasses.oncePerPerson, true),
          isNull(membershipTerms.id),
        ),
      )
      .groupBy(orderLines.variantId)
    return new Map(rows.map((row) => [row.variantId, row.orderId]))
  }

  // The person's other orders with any of these variants that are unpaid and
  // not cancelled, at any status: duplicates once another order with them is
  // paid
  async unpaidOrdersWith(userId: string, variantIds: number[], exceptOrderId: number): Promise<number[]> {
    if (!variantIds.length) return []
    const rows = await this.db
      .selectDistinct({ id: orders.id })
      .from(orders)
      .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(
        and(
          eq(orders.userId, userId),
          ne(orders.status, 'Cancelled'),
          eq(orders.paymentStatus, 'Pending'),
          ne(orders.id, exceptOrderId),
          inArray(orderLines.variantId, variantIds),
        ),
      )
    return rows.map((row) => row.id)
  }
}

export { OwnershipService }
