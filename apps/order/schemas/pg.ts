
import {
  boolean, integer, jsonb, numeric, pgTable,
  serial,
  text,
  timestamp
} from 'drizzle-orm/pg-core'
import { carts } from '../../cart/schemas'
import { pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const shippingAddresses = pgTable('shipping_address', {
    id: serial().primaryKey(),
    userId: text().notNull(),
    country: text(),
    country_code: text(),
    line_1: text(),
    line_2: text(),
    city: text(),
    house_no: text(),
    province: text(),
    postal_code: text(),
    instructions: text(),
    isDefault: boolean().notNull().default(false),
    metadata: jsonb(),
    createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
})


export const shippingMethods = pgTable('shipping_method', {
  id: serial().primaryKey(),
  name: text().notNull(),
  price: numeric().notNull(),
  metadata: jsonb(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
})

export const orderStatusEnum = pgEnum('order_status', ['Pending', 'Processing', 'Couriered', 'Shipped', 'Delivered', 'Returned', 'Cancelled', 'Completed'])
export const paymentStatusEnum = pgEnum('payment_status', ['Pending', 'Paid', 'Refunded'])

export const orders = pgTable('order', {
  id: serial().primaryKey(),
  userId: text(),
  guestUser: jsonb(),
  cartId: integer().notNull().references(() => carts.id),
  status: orderStatusEnum().notNull().default('Pending'),
  paymentStatus: paymentStatusEnum().notNull().default('Pending'),
  shippingAddress: jsonb().default({}),
  shippingMethod: jsonb().default({}),
  discount: numeric().notNull().default('0'),
  tax: numeric().notNull().default('0'),
  metadata: jsonb(),
  cancelledBy: text(),
  cancelledAt: timestamp({ mode: 'string', withTimezone: true }),
  cancellationReason: text(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
})

export const orderStatusChanges = pgTable('order_status_change', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  previousStatus: orderStatusEnum().notNull(),
  newStatus: orderStatusEnum().notNull(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
})

export const orderLines = pgTable('order_line', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  productId: integer().notNull(),
  price: numeric().notNull(),
  discount: numeric().notNull().default('0'),
  tax: numeric().notNull().default('0'),
  quantity: integer().notNull(),
  status: orderStatusEnum().notNull().default('Pending'),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
})

export const transactionStatusEnum = pgEnum('transaction_status', ['Requested', 'Success', 'Failed', 'Cancelled', 'Error', 'Disproved', 'Refunded'])

export const transactions = pgTable('transaction', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  gateway: text().notNull(),
  reference: text(),
  amount: numeric().notNull(),
  status: transactionStatusEnum().notNull().default('Requested'),
  metadata: jsonb(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).notNull().defaultNow(),
  lastRequestedAt: timestamp({ mode: 'string', withTimezone: true }),
})

export const paymentEventTypes = pgEnum('payment_event_type', ['Paid', 'Refund'])

export const paymentEvents = pgTable('payment_event', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id),
  amount: numeric().notNull(),
  type: paymentEventTypes().notNull().default('Paid'),
  reference: text(),
  metadata: jsonb(),
})

export const orderRelations = relations(orders, ({ many }) => ({
  lines: many(orderLines),
  statusChanges: many(orderStatusChanges),
  transactions: many(transactions),
  paymentEvents: many(paymentEvents),
}))

export const orderLineRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, {
    fields: [orderLines.orderId],
    references: [orders.id],
  }),
}))

export const orderStatusChangeRelations = relations(orderStatusChanges, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusChanges.orderId],
    references: [orders.id],
  }),
}))

export const transactionRelations = relations(transactions, ({ one }) => ({
  order: one(orders, {
    fields: [transactions.orderId],
    references: [orders.id],
  }),
}))

export const paymentEventRelations = relations(paymentEvents, ({ one }) => ({
  order: one(orders, {
    fields: [paymentEvents.orderId],
    references: [orders.id],
  }),
}))


export type Order = typeof orders.$inferSelect
export type NewOrder = Omit<typeof orders.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateOrder = Partial<NewOrder>

export type OrderLine = typeof orderLines.$inferSelect
export type NewOrderLine = Omit<typeof orderLines.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateOrderLine = Partial<NewOrderLine>

export type PaymentEvent = typeof paymentEvents.$inferSelect
export type NewPaymentEvent = Omit<typeof paymentEvents.$inferInsert, 'id'>
export type UpdatePaymentEvent = Partial<NewPaymentEvent>

export type OrderStatusChange = typeof orderStatusChanges.$inferSelect
export type NewOrderStatusChange = Omit<typeof orderStatusChanges.$inferInsert, 'id'>
export type UpdateOrderStatusChange = Partial<NewOrderStatusChange>

export type ShippingMethod = typeof shippingMethods.$inferSelect
export type NewShippingMethod = Omit<typeof shippingMethods.$inferInsert, 'id'>
export type UpdateShippingMethod = Partial<NewShippingMethod>

export type ShippingAddress = typeof shippingAddresses.$inferSelect
export type NewShippingAddress = Omit<typeof shippingAddresses.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateShippingAddress = Partial<NewShippingAddress>


export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = Omit<typeof transactions.$inferInsert, 'id' | 'createdAt'>
export type UpdateTransaction = Partial<NewTransaction>
