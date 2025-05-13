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
import { createHash } from 'node:crypto'
import { CartLine, carts } from '../../cart/schemas'
import {
  NewOrder,
  NewPaymentEvent,
  NewTransaction,
  orderLines,
  orderLogs,
  orders,
  orderStatusChanges,
  paymentEvents,
  transactions,
} from '../schemas'
import { products } from '../../product/schemas'

type Extend<T, U> = T & U

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
  constructor(private db: any) {
    this.db = db
  }

  generateHash(orderId: string): string {
    console.log(orderId)
    const hash = createHash('sha256')
    hash.update(orderId)
    return hash.digest('base64')
  }

  checkHash(orderId: string, hash: string): boolean {
    const newHash = this.generateHash(orderId)
    return newHash === hash
  }

  async create(
    data: NewOrder,
    cartLines: Array<
      Extend<
        CartLine,
        {
          product: {
            price: number
            discountedPrice?: number
          }
        }
      >
    >,
  ) {
    const [order] = await this.db.insert(orders).values(data).returning()
    await this.db
      .update(carts)
      .set({ status: 'Frozen' })
      .where(eq(carts.id, data.cartId))
    await this.db
      .insert(orderLines)
      .values(
        cartLines.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          price: line.product.price,
          discount: line.product.discountedPrice
            ? line.product.price - line.product.discountedPrice
            : 0,
          quantity: line.quantity,
        })),
      )
      .returning()
    const lines = await this.db.query.orderLines.findMany({
      where: eq(orderLines.orderId, order.id),
      with: {
        product: {
          name: true,
          thumbnail: true,
        },
      },
    })
    await this.createLog(order.id, STATUS_LOG.Pending)
    return {
      ...order,
      lines,
      hash: this.generateHash(order.id.toString()),
    }
  }

  async createLog(orderId: number, log: string) {
    await this.db.insert(orderLogs).values({
      orderId,
      log,
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
  ) {
    await this.db
      .update(orders)
      .set({ status: newStatus })
      .where(eq(orders.id, orderId))
    await this.db.insert(orderStatusChanges).values({
      orderId: orderId,
      previousStatus: previousStatus,
      newStatus,
    })
    await this.createLog(orderId, STATUS_LOG[newStatus])
  }

  async createTransaction(data: NewTransaction) {
    const [transaction] = await this.db
      .insert(transactions)
      .values(data)
      .returning()
    return transaction
  }

  async updateTransactionStatus(transactionId: number, newStatus: string) {
    await this.db
      .update(transactions)
      .set({ status: newStatus })
      .where(eq(transactions.id, transactionId))
  }

  async listTransactions(filters: {
    orderId?: number
    userId?: string
    status?: string
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
      .orderBy(asc(transactions.createdAt))
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
    await this.db.insert(paymentEvents).values(paymentEvent)
    await this.changePaymentStatus(
      paymentEvent.orderId,
      paymentEvent.type === 'Paid' ? 'Paid' : 'Refunded',
    )
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
      .orderBy(asc(paymentEvents.createdAt))
      .where(and(...where))
      .limit(size)
      .offset((page - 1) * size)
    const total = Number(
      (
        await this.db
          .select(sql<number>`count(*)`)
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
    previousStatus: OrderStatus,
    cancelledBy: string,
    cancellationReason: string,
    cancellationRemarks?: string | null,
  ) {
    await this.db
      .update(orders)
      .set({
        status: 'Cancelled',
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason,
        cancellationRemarks,
      })
      .where(eq(orders.id, orderId))
    await this.changeStatus(orderId, previousStatus, 'Cancelled')
    await this.createLog(orderId, STATUS_LOG.Cancelled)
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

    const query = {
      with: {
        lines: {
          with: {
            product: true,
          },
        },
      },
      where: and(...where),
    }

    if (!filters?.pagination) {
      return await this.db.query.orders.findMany(query)
    }

    const { page, size } = filters.pagination
    const results = await this.db.query.orders.findMany({
      ...query,
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

export { OrderService }
