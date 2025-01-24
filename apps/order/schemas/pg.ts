
import { jsonb } from 'drizzle-orm/pg-core'
import {
    boolean,
    pgTable,
    serial,
    text,
    timestamp,
  } from 'drizzle-orm/pg-core'

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

export type ShippingAddress = typeof shippingAddresses.$inferSelect
export type NewShippingAddress = Omit<typeof shippingAddresses.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateShippingAddress = Partial<NewShippingAddress>
