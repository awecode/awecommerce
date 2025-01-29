import { and, asc, desc, eq, inArray, notInArray, or, sql, SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { CartLine, carts } from "../../cart/schemas";
import { NewOrder, NewPaymentEvent, NewTransaction, Order, OrderLine, orderLines, orderLogs, orders, orderStatusChanges, paymentEvents, transactions } from "../schemas";

type OrderStatus = 'Pending'|'Confirmed'|'Processing'|'Processed'|'Couriered'|'Shipped'|'Delivered'|'Returned'|'Cancelled'|'Completed'
type OrderPaymentStatus = 'Pending'|'Paid'|'Refunded'

type OrderListFilter = {
    q?: string;
    tab?: 'Active'|'Inactive'|'Cancelled'|'Completed';
    status?: OrderStatus;
    userId?: string;
    createdAt?: string;
    paymentStatus?: OrderPaymentStatus;
    pagination?: {
        page: number;
        size: number;
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
    Completed: 'Order completed'
}
  

class OrderService {
    constructor(private db: any) {
        this.db = db;
    }

    generateHash(orderId: string): string {
        console.log(orderId)
        const hash = createHash('sha256');
        hash.update(orderId); 
        return hash.digest('base64'); 
    }
      
    checkHash(orderId: string, hash: string): boolean {
        const newHash = this.generateHash(orderId); 
        return newHash === hash
    }  

    async create(data: NewOrder, cartLines: CartLine[]) {
        const [order] = await this.db.insert(orders).values(data).returning()
        await this.db.update(carts).set({ status: "Frozen" }).where(eq(
            carts.id, data.cartId
        ))
        await this.db.insert(orderLines).values(cartLines.map((line: CartLine) => ({
            orderId: order.id,
            productId: line.productId,
            price: line.price,
            discount: Number(line.originalPrice) - Number(line.price),
            quantity: line.quantity
        })))
        await this.createLog(order.id, STATUS_LOG.Pending)
        return {
            ...order,
            hash: this.generateHash(order.id.toString())
        }
    }

    async calculateTotal(order: Pick<Order, 'id'| 'discount'| 'tax'>, lines?: OrderLine[]) {
        if(!lines) {
            lines = await this.db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
        }
        lines = lines?.filter((line: OrderLine) => line.status !== 'Cancelled');
        const subtotal = lines!.reduce((total: number, line: OrderLine) => total + ((Number(line.price) - Number(line.discount)) * line.quantity), 0);
        const discount = Number(order.discount) || 0;
        const tax = Number(order.tax) || 0;
        return subtotal - discount + tax;
    }

    async createLog(orderId: number, log: string) {
        await this.db.insert(orderLogs).values({
            orderId,
            log
        })
    }

    async getLogs(orderId: number) {
        return await this.db.select().from(orderLogs).where(eq(orderLogs.orderId, orderId)).orderBy(asc(orderLogs.createdAt))
    }

    async changeStatus(orderId: number, previousStatus: OrderStatus, newStatus: OrderStatus) {
        await this.db.update(orders).set({ status: newStatus }).where(eq(orders.id, orderId))
        await this.db.insert(orderStatusChanges).values({
            orderId: orderId,
            previousStatus: previousStatus,
            newStatus
        })
        await this.createLog(orderId, STATUS_LOG[newStatus])
    }

    async createTransaction(orderId: number, transaction: NewTransaction) {
        await this.db.insert(transactions).values({
            ...transaction,
            orderId
        })
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
        await this.db.update(orders).set({ paymentStatus: newStatus }).where(eq(orders.id, orderId))
    }

    async createPaymentEvent(paymentEvent: NewPaymentEvent) {
        await this.db.insert(paymentEvents).values(paymentEvent)
        await this.changePaymentStatus(paymentEvent.orderId, 
        paymentEvent.type === 'Paid' ? 'Paid' : 'Refunded'
        );
    }

    async cancel(orderId: number, cancelledBy: string, cancellationReason: string, cancellationRemarks?: string | null) {
        await this.db.update(orders).set({
            status: 'Cancelled',
            cancelledBy,
            cancelledAt: new Date(),
            cancellationReason,
            cancellationRemarks
        }).where(eq(orders.id, orderId))
    }

    async get(orderId: number, userId?: string) {
        const order = await this.db.query.orders.findFirst(
            {
                with:{
                    lines: {
                        with:{
                            product: {
                                with: {
                                    category: true,
                                    brand: true
                                }
                            }
                        }
                    }
                },
                where: and(
                    eq(orders.id, orderId),
                    userId ? eq(orders.userId, userId) : undefined
                )
            }
        )
        if (!order) {
            return null
        }
        return {
            ...order,
            total: await this.calculateTotal(order),
        }
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
                    eq(orders.userId, filters.q)
                )!
            )
        }

        if(filters?.tab){
            if(filters.tab === 'Active'){
                where.push(
                    notInArray(orders.status, ['Completed', 'Cancelled'])
                )
            }else if(filters.tab === 'Inactive'){
                where.push(
                    inArray(orders.status, ['Completed', 'Cancelled'])
                )
            }
            else{
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
                sql`date_trunc('day', ${orders.createdAt}) = ${filters.createdAt}`
            )
        }

        if (filters?.paymentStatus) {
            where.push(eq(orders.paymentStatus, filters.paymentStatus))
        }

        const query = {
            with: {
                lines: {
                    with:{
                        product: true
                    }
                }
            },
            where: and(...where)
        }


        if (!filters?.pagination) {
            return await this.db.query.orders.findMany(query)
        }

        const { page, size } = filters.pagination
        const results = await this.db.query.orders.findMany({
            ...query,
            orderBy: desc(orders.createdAt),
            skip: (page - 1) * size,
            take: size
        })
            
        const total = await this.db.$count(orders, and(...where))
        return {
            results: results,
            pagination: {
                page,
                size,
                total,
                pages: Math.ceil(total / size),
            }
        }
    }
}

export {
    OrderService
};
