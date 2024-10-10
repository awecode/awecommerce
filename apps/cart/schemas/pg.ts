import { products } from 'apps/product/schemas'
import { relations, sql } from 'drizzle-orm'
import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const cartStatus = pgEnum('cart_status', ['Open', 'Frozen', 'Cancelled', 'Merged'])

export const carts = pgTable('cart', {
  id: serial().primaryKey(),
  userId: text(),
  sessionId: uuid().notNull().default(sql`uuid_generate_v4()`).unique(),
  status: cartStatus().default('Open'),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const cartLines = pgTable('cart_line', {
  id: serial().primaryKey(),
  cartId: integer().references(() => carts.id),
  productId: integer().references(() => products.id),
  price: numeric().notNull(),
  originalPrice: numeric().notNull(),
  quantity: integer().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const cartLineRelations = relations(cartLines, ({ one }) => ({
  cart: one(carts, {
    fields: [cartLines.cartId],
    references: [carts.id],
  }),
  product: one(products, {
    fields: [cartLines.productId],
    references: [products.id],
  }),
}))

export const cartRelations = relations(carts, ({ many }) => ({
  cartLines: many(cartLines),
}))

export type Cart = typeof carts.$inferSelect
export type CartLine = typeof cartLines.$inferSelect
