import { Exact, paginate } from '../../../core/pagination'
import { NotFoundError, ValidationError } from '../../../core/errors'
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Decimal } from 'decimal.js'
import { cartAppliedVoucherOffers, carts } from '../../cart/schemas'
import { CartService, customizationsError } from '../../cart/services/cart'
import { ProductService, ProductVariantService } from '../../product/services/product'
import { priceCart } from '../../cart/services/pricing'
import { offers, offerUsages } from '../../offer/schemas'
import { OfferService } from '../../offer/services/offer'
import { LoyaltyService } from '../../loyalty/services/loyalty'
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
import { products, productVariants } from '../../product/schemas'
import { MembershipService } from '../../membership/services/membership'
import { Database } from '../../types'

type CreateFromCartOptions = {
  guestUser?: NewOrder['guestUser']
  paymentMethod?: string
  shippingAddress?: NewOrder['shippingAddress']
  metadata?: NewOrder['metadata']
  shippingMethodId?: number
  // Loyalty points to redeem. Their value reduces the products (not shipping)
  // before tax, and the points are taken from the user's balance.
  redeemPoints?: number
  // The total the customer was shown. If the computed total differs, the
  // order is not created and OrderTotalMismatchError is thrown.
  expectedTotal?: string | number
}

// An order's latest online payment try, in its metadata.payment: the
// provider, the gateway's reference for it, open (the buyer is paying, or we
// have not heard back) or failed (with the gateway's message), and when it
// started
export type PaymentTry = {
  provider: string
  reference: string
  status: 'open' | 'failed'
  message?: string
  startedAt: string
}

// Amounts as the logs show them: "1250.5"
const shownAmount = (value: string | number) => String(Number(value))
const sameAmount = (a: string | number, b: string | number) => Math.abs(Number(a) - Number(b)) < 0.0001

class OfferLimitReachedError extends Error {
  constructor(
    public offerId: number,
    public offerName: string,
  ) {
    super(`Offer usage limit reached: ${offerName}`)
    this.name = 'OfferLimitReachedError'
  }
}

class CustomizationsNoLongerValidError extends Error {
  constructor(
    public cartLineId: number,
    public productName: string,
    public reason: string,
  ) {
    super(`Customizations are no longer valid for ${productName}: ${reason}`)
    this.name = 'CustomizationsNoLongerValidError'
  }
}

class VoucherNoLongerValidError extends Error {
  constructor(
    public offerId: number,
    public voucherCode: string | null,
  ) {
    super(`Voucher can no longer be applied: ${voucherCode}`)
    this.name = 'VoucherNoLongerValidError'
  }
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
  // An order id, a user id, or part of the guest's email or name
  q?: string
  // Users whose own details match `q` (such as their email), looked up by the
  // app, since users are not the library's: their orders match too
  qUserIds?: string[]
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
    const { shippingMethodId, expectedTotal, redeemPoints, ...orderData } = options
    return await this.db.transaction(async (tx) => {
      const orderService = new OrderService(tx)
      // Locked so the same cart cannot be ordered twice at the same time
      const [cart] = await tx
        .select()
        .from(carts)
        .where(eq(carts.id, cartId))
        .for('update')
      if (!cart) {
        throw new NotFoundError(`Cart not found: ${cartId}`)
      }
      if (cart.status !== 'Open') {
        throw new ValidationError(`Cart is not open: ${cartId}`)
      }

      // Lock the cart's vouchers before they are re-applied below. Re-applying
      // inserts rows that reference them, which takes a shared lock on each
      // voucher; locking them afterwards would deadlock concurrent checkouts.
      const cartVouchers = await tx
        .select({ offerId: cartAppliedVoucherOffers.offerId })
        .from(cartAppliedVoucherOffers)
        .where(eq(cartAppliedVoucherOffers.cartId, cart.id))
      const lockedVouchers = await this.lockOffers(
        tx,
        cartVouchers.map((voucher) => voucher.offerId),
      )

      const content = await new CartService(tx).getCartContentForSession(
        cart.sessionId,
        true,
      )
      if (!content.lines.length) {
        throw new ValidationError('Cannot create an order without lines')
      }
      // Only active variants of products the store shows
      const listedIds = new Set(
        await new ProductService(tx).listedProductIds(
          content.lines.map((line) => line.variant.productId),
        ),
      )
      const inactiveLine = content.lines.find(
        (line) => !line.variant.isActive || !listedIds.has(line.variant.productId),
      )
      if (inactiveLine) {
        throw new ValidationError(
          `Product variant is not available: ${inactiveLine.variant.sku}`,
        )
      }
      // Re-applying drops vouchers that ran out, expired or no longer match the
      // cart. Fail instead of placing the order without a discount the
      // customer applied.
      // A voucher kept on the cart but left out for a bigger discount that does
      // not combine with it is still valid: it is just not used.
      const reappliedIds = new Set([
        ...content.voucherOfferDiscounts.map((d) => d.id),
        ...content.notCombinedVoucherOffers.map((voucher) => voucher.id),
      ])
      const droppedVoucher = lockedVouchers.find(
        (voucher) => !reappliedIds.has(voucher.id),
      )
      if (droppedVoucher) {
        throw new VoucherNoLongerValidError(
          droppedVoucher.id,
          droppedVoucher.voucherCode,
        )
      }
      const terms = await new MembershipService(tx).termsForVariants(
        content.lines.map((line) => line.variantId),
      )
      // A membership belongs to an account
      if (!cart.userId && terms.size) {
        throw new ValidationError('Sign in to buy a membership')
      }
      // A plan turned off is no longer sold
      const retired = content.lines.find((line) => terms.get(line.variantId)?.plan.isActive === false)
      if (retired) {
        throw new ValidationError(`Product variant is not available: ${retired.variant.sku}`)
      }
      // The product's custom fields may have changed since the buyer answered
      // them. Fail instead of placing an order with answers it no longer asks for.
      for (const line of content.lines) {
        const { product } = line.variant
        const reason = customizationsError(product.customFields, line.customizations)
        if (reason) {
          throw new CustomizationsNoLongerValidError(line.id, product.name, reason)
        }
      }

      // Locked until the order is placed, so two checkouts cannot sell the
      // same stock
      const wanted = new Map<number, number>()
      for (const line of content.lines) {
        wanted.set(line.variantId, (wanted.get(line.variantId) ?? 0) + line.quantity)
      }
      const stock = await new ProductVariantService(tx).checkStock(wanted, { lock: true })
      const tracked = (variantId: number) => stock.get(variantId)?.stock !== null

      const loyaltyDiscount =
        redeemPoints !== undefined
          ? await new LoyaltyService(tx).redemptionValue(cart.userId, redeemPoints)
          : 0
      const pricing = await priceCart(tx, content, shippingMethodId, loyaltyDiscount)
      const { shippingMethod } = pricing
      const appliedOffers = [
        ...content.siteOfferDiscounts,
        ...content.userOfferDiscounts,
        ...content.voucherOfferDiscounts,
      ]
      await this.checkOfferLimits(
        tx,
        appliedOffers.map((offer) => offer.id),
        cart.userId,
      )
      if (expectedTotal !== undefined && !new Decimal(pricing.total).eq(expectedTotal)) {
        throw new OrderTotalMismatchError(
          new Decimal(expectedTotal).toString(),
          pricing.total,
        )
      }

      const [order] = await tx
        .insert(orders)
        .values({
          ...orderData,
          userId: cart.userId,
          cartId: cart.id,
          offers: appliedOffers,
          discount: pricing.offerDiscount,
          loyaltyDiscount: pricing.loyaltyDiscount,
          shippingCharge: pricing.shippingCharge,
          tax: pricing.tax,
          total: pricing.total,
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
      if (redeemPoints !== undefined) {
        await new LoyaltyService(tx).redeemPoints(cart.userId!, order.id, redeemPoints)
      }
      // Uses up the applied offers' per-user and overall limits
      await new OfferService(tx).increaseUsageMultiple(
        appliedOffers.map((offer) => offer.id),
        cart.userId,
      )
      await tx
        .insert(orderLines)
        .values(
          pricing.lines.map(({ cartLineId, ...line }) => ({
            ...line,
            orderId: order.id,
            stockTaken: tracked(line.variantId),
          })),
        )
      for (const [variantId, quantity] of wanted) {
        if (tracked(variantId)) {
          await tx
            .update(productVariants)
            .set({ stockQuantity: sql`${productVariants.stockQuantity} - ${quantity}` })
            .where(eq(productVariants.id, variantId))
        }
      }
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

  async changeStatus(orderId: number, newStatus: OrderStatus, changedBy?: string) {
    if (newStatus === 'Cancelled') {
      // cancel() also records who cancelled and why, and gives offer usage back
      throw new ValidationError('Use cancel() to cancel an order')
    }
    return await this.db.transaction(async (tx) => {
      // Locked so the previous status cannot change before it is recorded
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
      if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      if (order.status === 'Cancelled') {
        throw new ValidationError(`Order is cancelled: ${orderId}`)
      }
      if (order.status === newStatus) {
        throw new ValidationError(`Order is already ${newStatus}: ${orderId}`)
      }
      await new OrderService(tx).recordStatusChange(
        orderId,
        order.status,
        newStatus,
        changedBy,
      )
    })
  }

  // Locks offer rows in id order, so concurrent checkouts wait for each other
  // instead of deadlocking
  private async lockOffers(tx: Database, offerIds: number[]) {
    const uniqueOfferIds = [...new Set(offerIds)]
    if (!uniqueOfferIds.length) {
      return []
    }
    return await tx
      .select()
      .from(offers)
      .where(inArray(offers.id, uniqueOfferIds))
      .orderBy(asc(offers.id))
      .for('update')
  }

  // Checks the applied offers' limits again, under lock. The cart checked them
  // when the offers were applied, but concurrent checkouts can use them up
  // before this order records its usage.
  private async checkOfferLimits(
    tx: Database,
    offerIds: number[],
    userId: string | null,
  ) {
    for (const offer of await this.lockOffers(tx, offerIds)) {
      if (
        offer.overallLimit !== null &&
        (offer.usageCount ?? 0) >= offer.overallLimit
      ) {
        throw new OfferLimitReachedError(offer.id, offer.name)
      }
      if (offer.limitPerUser !== null && userId) {
        const [usage] = await tx
          .select()
          .from(offerUsages)
          .where(
            and(eq(offerUsages.offerId, offer.id), eq(offerUsages.userId, userId)),
          )
        if ((usage?.usageCount ?? 0) >= offer.limitPerUser) {
          throw new OfferLimitReachedError(offer.id, offer.name)
        }
      }
    }
  }

  // Writes the new status, its history row and the log. Callers must lock the
  // order row first, inside the same transaction.
  private async recordStatusChange(
    orderId: number,
    previousStatus: OrderStatus,
    newStatus: OrderStatus,
    changedBy?: string,
  ) {
    await this.db
      .update(orders)
      .set({ status: newStatus })
      .where(eq(orders.id, orderId))
    await this.db.insert(orderStatusChanges).values({
      orderId,
      previousStatus,
      newStatus,
      createdBy: changedBy,
    })
    await this.createLog(orderId, STATUS_LOG[newStatus], changedBy)
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
            'productName', ${orderLines.productName},
            'variantTitle', ${orderLines.variantTitle},
            'sku', ${orderLines.sku},
            'imageUrl', ${orderLines.imageUrl},
            'options', ${orderLines.options},
            'product', json_build_object(
                'id', ${products.id},
                'name', ${products.name},
                'description', ${products.description}
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

  // Sets the payment status by hand (for example cash on delivery) and logs it
  async changePaymentStatus(
    orderId: number,
    newStatus: OrderPaymentStatus,
    changedBy?: string | null,
  ) {
    return await this.db.transaction(async (tx) => {
      const [order] = await tx
        .update(orders)
        .set({ paymentStatus: newStatus, updatedAt: new Date().toISOString() })
        .where(eq(orders.id, orderId))
        .returning()
      if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      await new OrderService(tx).createLog(orderId, `Payment ${newStatus}`, changedBy)
      return order
    })
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

  // A payment a gateway confirmed. Recorded once per `reference` (the
  // gateway's payment id), so repeated webhooks and returns do nothing more.
  // The order is marked Paid only when it is unpaid, not cancelled, and the
  // amount is its total; otherwise the payment is kept and the order log says
  // why, for staff to sort out. Returns 'paid', 'duplicate' or 'not-marked'.
  async recordPayment(
    orderId: number,
    payment: { amount: string; reference: string; method: string; label?: string; metadata?: Record<string, unknown> },
  ) {
    return await this.db.transaction(async (tx) => {
      // Locked, so a webhook and the buyer's return cannot both record it
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
      if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      const [seen] = await tx
        .select({ id: paymentEvents.id })
        .from(paymentEvents)
        .where(and(eq(paymentEvents.orderId, orderId), eq(paymentEvents.type, 'Paid'), eq(paymentEvents.reference, payment.reference)))
      if (seen) {
        return 'duplicate' as const
      }
      await tx.insert(paymentEvents).values({
        orderId,
        amount: payment.amount,
        type: 'Paid',
        reference: payment.reference,
        metadata: { method: payment.method, ...payment.metadata },
      })
      const orderService = new OrderService(tx)
      const received = `${shownAmount(payment.amount)} through ${payment.label ?? payment.method} (${payment.reference})`
      const problem =
        order.status === 'Cancelled'
          ? 'the order is cancelled'
          : order.paymentStatus !== 'Pending'
            ? `the order is already ${order.paymentStatus.toLowerCase()}`
            : !sameAmount(payment.amount, order.total)
              ? `the order total is ${shownAmount(order.total)}`
              : null
      if (problem) {
        await orderService.createLog(orderId, `Payment of ${received} received, not marked paid: ${problem}`)
        return 'not-marked' as const
      }
      await tx.update(orders).set({ paymentStatus: 'Paid', updatedAt: new Date().toISOString() }).where(eq(orders.id, orderId))
      await orderService.createLog(orderId, `Paid ${received}`)
      return 'paid' as const
    })
  }

  // A refund a gateway made: recorded, the order marked Refunded, and logged
  async recordRefund(
    orderId: number,
    refund: { amount: string; reference: string; method: string; label?: string; refundedBy?: string | null },
  ) {
    return await this.db.transaction(async (tx) => {
      await tx.insert(paymentEvents).values({ orderId, amount: refund.amount, type: 'Refund', reference: refund.reference, metadata: { method: refund.method } })
      const [order] = await tx
        .update(orders)
        .set({ paymentStatus: 'Refunded', updatedAt: new Date().toISOString() })
        .where(eq(orders.id, orderId))
        .returning()
      if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      await new OrderService(tx).createLog(
        orderId,
        `Refunded ${shownAmount(refund.amount)} through ${refund.label ?? refund.method} (${refund.reference})`,
        refund.refundedBy,
      )
      return order
    })
  }

  // Changes the payment method, and sets or clears (null) the latest online
  // payment try (see PaymentTry). Logs `log` when given.
  async updatePayment(
    orderId: number,
    changes: { paymentMethod?: string; paymentTry?: PaymentTry | null },
    log?: string,
    loggedBy?: string | null,
  ) {
    return await this.db.transaction(async (tx) => {
      const [order] = await tx
        .update(orders)
        .set({
          ...(changes.paymentMethod !== undefined ? { paymentMethod: changes.paymentMethod } : {}),
          ...(changes.paymentTry !== undefined
            ? {
                metadata:
                  changes.paymentTry === null
                    ? sql`COALESCE(${orders.metadata}, '{}'::jsonb) - 'payment'`
                    : sql`COALESCE(${orders.metadata}, '{}'::jsonb) || jsonb_build_object('payment', ${JSON.stringify(changes.paymentTry)}::jsonb)`,
              }
            : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(orders.id, orderId))
        .returning()
      if (!order) {
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      if (log) {
        await new OrderService(tx).createLog(orderId, log, loggedBy)
      }
      return order
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
        throw new NotFoundError(`Order not found: ${orderId}`)
      }
      if (order.status === 'Cancelled') {
        throw new ValidationError(`Order is already cancelled: ${orderId}`)
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
      // Gives back the stock the order took
      const taken = await tx
        .select({ variantId: orderLines.variantId, quantity: orderLines.quantity })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, orderId), eq(orderLines.stockTaken, true)))
      for (const line of taken) {
        await tx
          .update(productVariants)
          .set({ stockQuantity: sql`${productVariants.stockQuantity} + ${line.quantity}` })
          .where(eq(productVariants.id, line.variantId))
      }
      // Gives back loyalty points redeemed for the order
      if (order.userId) {
        await new LoyaltyService(tx).unredeemOrderPoints(order.userId, orderId)
      }
      await orderService.recordStatusChange(orderId, order.status, 'Cancelled', cancelledBy)
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

  // Gives a user the orders they placed as a guest with this email, in any
  // case. Returns the ids of the orders it linked. Call it only with an email
  // the user has proven they own (for example a verified sign-in email):
  // otherwise anyone could see another buyer's orders.
  async claimGuestOrders(userId: string, email: string) {
    const claimed = await this.db
      .update(orders)
      .set({ userId, updatedAt: new Date().toISOString() })
      .where(
        and(
          isNull(orders.userId),
          sql`lower(${orders.guestUser}->>'email') = lower(${email})`,
        ),
      )
      .returning({ id: orders.id })
    return claimed.map((order) => order.id)
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

  async list<F extends OrderListFilter = {}>(filters?: Exact<F, OrderListFilter>) {
    const where: SQL[] = []

    if (filters?.q) {
      where.push(
        or(
          Number(filters.q) ? eq(orders.id, Number(filters.q)) : undefined,
          eq(orders.userId, filters.q),
          sql`${orders.guestUser}->>'email' ILIKE ${`%${filters.q}%`}`,
          sql`${orders.guestUser}->>'name' ILIKE ${`%${filters.q}%`}`,
          filters.qUserIds?.length ? inArray(orders.userId, filters.qUserIds) : undefined,
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

    return await paginate(
      filters as F | undefined,
      (page) =>
        this.db.query.orders.findMany({
          with: {
            lines: {
              with: {
                product: true,
              },
            },
          },
          where: and(...where),
          orderBy: desc(orders.createdAt),
          ...page,
        }),
      () => this.db.$count(orders, and(...where)),
    )
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

export {
  CustomizationsNoLongerValidError,
  OfferLimitReachedError,
  OrderService,
  OrderTotalMismatchError,
  VoucherNoLongerValidError,
}
