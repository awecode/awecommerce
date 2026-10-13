import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  notInArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { carts } from '../../cart/schemas'
import { CartService } from '../../cart/services/cart'
import { OfferService } from '../../offer/services/offer'
import {
  NewOrder,
  NewPaymentEvent,
  NewTransaction,
  orderLines,
  orderLogs,
  orders,
  orderStatusChanges,
  paymentEvents,
  shippingMethods,
  transactions,
} from '../schemas'
import { products } from '../../product/schemas'
import { Database } from '../../types'

type CreateFromCartOptions = {
  guestUser?: NewOrder['guestUser']
  shippingAddress?: NewOrder['shippingAddress']
  metadata?: NewOrder['metadata']
  shippingMethodId?: number
  // The total the customer was shown. If the computed total differs, the
  // order is not created and OrderTotalMismatchError is thrown.
  expectedTotal?: string | number
}

class OrderTotalMismatchError extends Error {
  constructor(
    public expectedTotal: string,
    public actualTotal: string,
  ) {
    super(`Order total changed: expected ${expectedTotal}, got ${actualTotal}`)
    this.name = 'OrderTotalMismatchError'
  }
}

type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Processing'
  | 'Processed'
  | 'Couriered'
  | 'Shipped'
  | 'Delivered'
  | 'Returned'
  | 'Cancelled'
  | 'Completed'
type OrderPaymentStatus = 'Pending' | 'Paid' | 'Refunded'

type OrderListFilter = {
  q?: string
  tab?: 'Active' | 'Inactive' | 'Cancelled' | 'Completed'
  status?: OrderStatus
  userId?: string
  createdAt?: string
  paymentStatus?: OrderPaymentStatus
  extraFilters?: SQL[]
  pagination?: {
    page: number
    size: number
  }
}

const STATUS_LOG: { [key in OrderStatus]: string } = {
  Pending: 'Order received',
  Confirmed: 'Order confirmed',
  Processing: 'Order in progress',
  Processed: 'Ready for shipping',
  Couriered: 'Order couriered',
  Shipped: 'Order shipped',
  Delivered: 'Order delivered',
  Returned: 'Order returned',
  Cancelled: 'Order cancelled',
  Completed: 'Order completed',
}

class OrderService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  generateHash(orderId: string): string {
    const secret = process.env.ORDER_HASH_SECRET
    if (!secret) {
      throw new Error('ORDER_HASH_SECRET is not set')
    }
    const hash = createHmac('sha256', secret)
    hash.update(orderId)
    return hash.digest('base64url')
  }

  checkHash(orderId: string, hash: string): boolean {
    const expected = Buffer.from(this.generateHash(orderId))
    const actual = Buffer.from(hash)
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    )
  }

  // Creates an order from an open cart. Prices, offer discounts and shipping
  // are read from the database here, never taken from the caller.
  async createFromCart(cartId: number, options: CreateFromCartOptions = {}) {
    const { shippingMethodId, expectedTotal, ...orderData } = options
    return await this.db.transaction(async (tx) => {
      const orderService = new OrderService(tx)
      // Locked so the same cart cannot be ordered twice at the same time
      const [cart] = await tx
        .select()
        .from(carts)
        .where(eq(carts.id, cartId))
        .for('update')
      if (!cart) {
        throw new Error(`Cart not found: ${cartId}`)
      }
      if (cart.status !== 'Open') {
        throw new Error(`Cart is not open: ${cartId}`)
      }

      const content = await new CartService(tx).getCartContentForSession(
        cart.sessionId,
        true,
      )
      if (!content.lines.length) {
        throw new Error('Cannot create an order without lines')
      }

      let shippingMethod: typeof shippingMethods.$inferSelect | undefined
      if (shippingMethodId !== undefined) {
        ;[shippingMethod] = await tx
          .select()
          .from(shippingMethods)
          .where(eq(shippingMethods.id, shippingMethodId))
        if (!shippingMethod) {
          throw new Error(`Shipping method not found: ${shippingMethodId}`)
        }
      }

      const lineValues = content.lines.map((line) => {
        const listPrice = line.product.price
        const salePrice = line.product.discountedPrice
        return {
          productId: line.productId,
          productName: line.product.name,
          productSku: line.product.sku,
          price: listPrice ?? salePrice ?? null,
          discount:
            listPrice && salePrice
              ? new Decimal(listPrice).sub(salePrice).toString()
              : '0',
          quantity: line.quantity,
        }
      })
      const appliedOffers = [
        ...content.userOfferDiscounts,
        ...content.voucherOfferDiscounts,
      ]
      const offerDiscount = new Decimal(content.totalOfferDiscount)
      const shippingCharge = new Decimal(shippingMethod?.price ?? 0)
      // A line without any price counts as zero
      const subtotal = lineValues.reduce(
        (sum, line) =>
          sum.add(new Decimal(line.price ?? 0).sub(line.discount).mul(line.quantity)),
        new Decimal(0),
      )
      const total = subtotal.sub(offerDiscount).add(shippingCharge)
      if (expectedTotal !== undefined && !total.eq(expectedTotal)) {
        throw new OrderTotalMismatchError(
          new Decimal(expectedTotal).toString(),
          total.toString(),
        )
      }

      const [order] = await tx
        .insert(orders)
        .values({
          ...orderData,
          userId: cart.userId,
          cartId: cart.id,
          offers: appliedOffers,
          discount: offerDiscount.toString(),
          shippingCharge: shippingCharge.toString(),
          ...(shippingMethod
            ? {
                shippingMethod: {
                  id: shippingMethod.id,
                  name: shippingMethod.name,
                  price: shippingMethod.price,
                  metadata: shippingMethod.metadata,
                },
              }
            : {}),
        })
        .returning()
      await tx
        .update(carts)
        .set({ status: 'Frozen' })
        .where(eq(carts.id, cart.id))
      // Uses up the applied offers' per-user and overall limits
      await new OfferService(tx).increaseUsageMultiple(
        appliedOffers.map((offer) => offer.id),
        cart.userId,
      )
      await tx
        .insert(orderLines)
        .values(lineValues.map((line) => ({ ...line, orderId: order.id })))
      const lines = await tx.query.orderLines.findMany({
        where: eq(orderLines.orderId, order.id),
        with: {
          product: {
            columns: {
              name: true,
              thumbnail: true,
            },
          },
        },
      })
      await orderService.createLog(order.id, STATUS_LOG.Pending, order.userId)
      return {
        ...order,
        lines,
        total: total.toString(),
        hash: this.generateHash(order.id.toString()),
      }
    })
  }

  async createLog(orderId: number, log: string, loggedBy?: string | null) {
    await this.db.insert(orderLogs).values({
      orderId,
      log,
      loggedBy,
    })
  }

  async getLogs(orderId: number) {
    return await this.db
      .select()
      .from(orderLogs)
      .where(eq(orderLogs.orderId, orderId))
      .orderBy(asc(orderLogs.createdAt))
  }

  async changeStatus(
    orderId: number,
    previousStatus: OrderStatus,
    newStatus: OrderStatus,
    createdBy?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const orderService = new OrderService(tx)
      await tx
        .update(orders)
        .set({ status: newStatus })
        .where(eq(orders.id, orderId))
      await tx.insert(orderStatusChanges).values({
        orderId: orderId,
        previousStatus: previousStatus,
        newStatus,
        createdBy,
      })
      await orderService.createLog(orderId, STATUS_LOG[newStatus], createdBy)
    })
  }

  async createTransaction(data: NewTransaction) {
    const [transaction] = await this.db
      .insert(transactions)
      .values(data)
      .returning()
    return transaction
  }

  async updateTransactionStatus(transactionId: number, newStatus: "Refunded" | "Requested" | "Success" | "Failed" | "Error" | "Disproved" ) {
    await this.db
      .update(transactions)
      .set({ status: newStatus })
      .where(eq(transactions.id, transactionId))
  }

  async listTransactions(filters: {
    orderId?: number
    userId?: string
    status?: "Refunded" | "Requested" | "Success" | "Failed" | "Error" | "Disproved" 
    pagination: {
      page: number
      size: number
    }
  }) {
    const { page, size } = filters.pagination
    const where: SQL[] = []
    if (filters.orderId) {
      where.push(eq(transactions.orderId, filters.orderId))
    }
    if (filters.userId) {
      where.push(eq(orders.userId, filters.userId))
    }
    if (filters.status) {
      where.push(eq(transactions.status, filters.status))
    }
    const results = await this.db
      .select({
        ...getTableColumns(transactions),
        order: {
          ...getTableColumns(orders),
          lines: sql`json_agg(json_build_object(
            'id', ${orderLines.id},
            'quantity', ${orderLines.quantity},
            'price', ${orderLines.price},
            'tax', ${orderLines.tax},
            'discount', ${orderLines.discount},
            'product', json_build_object(
                'id', ${products.id},
                'name', ${products.name},
                'description', ${products.description},
                'price', ${products.price},
                'discountedPrice', ${products.discountedPrice}
            )
        ))`.as('lines'),
        },
      })
      .from(transactions)
      .leftJoin(orders, eq(orders.id, transactions.orderId))
      .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
      .leftJoin(products, eq(products.id, orderLines.productId))

      .where(and(...where))
      .groupBy(transactions.id, orders.id)
      .orderBy(desc(transactions.createdAt))
      .limit(size)
      .offset((page - 1) * size)
    const total = Number(
      (
        await this.db
          .select({ count: sql<number>`count(*)` })
          .from(transactions)
          .leftJoin(orders, eq(orders.id, transactions.orderId))
          .where(and(...where))
      )[0].count,
    )
    return {
      results,
      pagination: {
        page: page,
        size: size,
        total,
        pages: Math.ceil(total / size),
      },
    }
  }

  // async calculateTotalPayments(order: Pick<Order, 'id'>) {
  //     const payments = await this.db.select().from(paymentEvents).where(eq(paymentEvents.orderId, order.id));
  //     return payments.reduce((total: number, payment: NewPaymentEvent) => {
  //         if (payment.type === 'Paid') {
  //             return total + Number(payment.amount);
  //         } else if (payment.type === 'Refund') {
  //             return total - Number(payment.amount);
  //         }
  //         return total;
  //     }, 0);
  // }

  async changePaymentStatus(orderId: number, newStatus: OrderPaymentStatus) {
    await this.db
      .update(orders)
      .set({ paymentStatus: newStatus })
      .where(eq(orders.id, orderId))
  }

  async createPaymentEvent(paymentEvent: NewPaymentEvent) {
    return await this.db.transaction(async (tx) => {
      const orderService = new OrderService(tx)
      await tx.insert(paymentEvents).values(paymentEvent)
      await orderService.changePaymentStatus(
        paymentEvent.orderId,
        paymentEvent.type === 'Paid' ? 'Paid' : 'Refunded',
      )
    })
  }

  async getLastPaymentEvent(orderId: number) {
    const [paymentEvent] = await this.db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.orderId, orderId))
      .orderBy(desc(paymentEvents.createdAt))
      .limit(1)
    return paymentEvent
  }

  async listPaymentEvents(filters: {
    userId?: string
    orderId?: number
    pagination: {
      page: number
      size: number
    }
  }) {
    const { page, size } = filters.pagination
    const where: SQL[] = []
    if (filters.orderId) {
      where.push(eq(paymentEvents.orderId, filters.orderId))
    }
    if (filters.userId) {
      where.push(eq(orders.userId, filters.userId))
    }
    const results = await this.db
      .select(getTableColumns(paymentEvents))
      .from(paymentEvents)
      .leftJoin(orders, eq(orders.id, paymentEvents.orderId))
      .orderBy(desc(paymentEvents.createdAt))
      .where(and(...where))
      .limit(size)
      .offset((page - 1) * size)
    const total = Number(
      (
        await this.db
          .select({ count: sql<number>`count(*)` })
          .from(paymentEvents)
          .leftJoin(orders, eq(orders.id, paymentEvents.orderId))
          .where(and(...where))
      )[0].count,
    )

    return {
      results,
      pagination: {
        page: page,
        size: size,
        total,
        pages: Math.ceil(total / size),
      },
    }
  }

  async cancel(
    orderId: number,
    cancelledBy: string,
    cancellationReason: string,
    cancellationRemarks?: string | null,
  ) {
    return await this.db.transaction(async (tx) => {
      const orderService = new OrderService(tx)
      // Locked so the order cannot be cancelled twice at the same time
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
      if (!order) {
        throw new Error(`Order not found: ${orderId}`)
      }
      if (order.status === 'Cancelled') {
        throw new Error(`Order is already cancelled: ${orderId}`)
      }
      await tx
        .update(orders)
        .set({
          status: 'Cancelled',
          cancelledBy,
          cancelledAt: new Date().toISOString(),
          cancellationReason,
          cancellationRemarks,
        })
        .where(eq(orders.id, orderId))
      // Gives back the offer usage recorded when the order was created
      const offerService = new OfferService(tx)
      const offerIds = new Set((order.offers ?? []).map((offer) => offer.id as number))
      for (const offerId of offerIds) {
        await offerService.decreaseUsage(offerId, order.userId)
      }
      await orderService.changeStatus(orderId, order.status, 'Cancelled', cancelledBy)
    })
  }

  async get(orderId: number, userId?: string) {
    const order = await this.db.query.orders.findFirst({
      with: {
        lines: {
          with: {
            product: {
              with: {
                category: true,
                brand: true,
              },
            },
          },
        },
        paymentEvents: {
          columns: {
            amount: true,
            type: true,
            reference: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      where: and(
        eq(orders.id, orderId),
        userId ? eq(orders.userId, userId) : undefined,
      ),
    })
    if (!order) {
      return null
    }
    return order
  }

  async getByHash(orderId: number, hash: string) {
    if (!this.checkHash(orderId.toString(), hash)) {
      return null
    }
    const order = await this.get(orderId)
    if (!order) {
      return null
    }
    return order
  }

  async list(filters?: OrderListFilter) {
    const where: SQL[] = []

    if (filters?.q) {
      where.push(
        or(
          Number(filters.q) ? eq(orders.id, Number(filters.q)) : undefined,
          eq(orders.userId, filters.q),
        )!,
      )
    }

    if (filters?.tab) {
      if (filters.tab === 'Active') {
        where.push(notInArray(orders.status, ['Completed', 'Cancelled']))
      } else if (filters.tab === 'Inactive') {
        where.push(inArray(orders.status, ['Completed', 'Cancelled']))
      } else {
        where.push(eq(orders.status, filters.tab))
      }
    }

    if (filters?.status) {
      where.push(eq(orders.status, filters.status))
    }

    if (filters?.userId) {
      where.push(eq(orders.userId, filters.userId))
    }

    if (filters?.createdAt) {
      where.push(
        sql`date_trunc('day', ${orders.createdAt}) = ${filters.createdAt}`,
      )
    }

    if (filters?.paymentStatus) {
      where.push(eq(orders.paymentStatus, filters.paymentStatus))
    }

    if (filters?.extraFilters) {
      where.push(...filters.extraFilters)
    }

    if (!filters?.pagination) {
      return await this.db.query.orders.findMany( {
      with: {
        lines: {
          with: {
            product: true,
          },
        },
      },
      where: and(...where),
    })
    }

    const { page, size } = filters.pagination
    const results = await this.db.query.orders.findMany({
      with: {
        lines: {
          with: {
            product: true,
          },
        },
      },
      where: and(...where),
      orderBy: desc(orders.createdAt),
      offset: (page - 1) * size,
      limit: size,
    })

    const total = await this.db.$count(orders, and(...where))
    return {
      results: results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
  }

  async delete(orderId: number) {
    await this.db.delete(orders).where(eq(orders.id, orderId))
  }

  async hasOrderWithProductId(productId: number) {
    const orderLinesWithProduct = await this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.productId, productId))
    return orderLinesWithProduct.length > 0
  }
}

export { OrderService, OrderTotalMismatchError }
