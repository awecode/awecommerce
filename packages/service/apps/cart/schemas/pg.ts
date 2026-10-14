import { offers } from '../../offer/schemas/pg'
import { productVariants } from '../../product/schemas/pg'
import { relations, sql } from 'drizzle-orm'
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const cartStatus = pgEnum('cart_status', ['Open', 'Frozen', 'Cancelled', 'Merged'])

export const carts = pgTable('cart', {
  id: serial().primaryKey(),
  userId: text(),
  sessionId: uuid().notNull().default(sql`uuid_generate_v4()`).unique(),
  status: cartStatus().notNull().default('Open'),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const cartAppliedVoucherOffers = pgTable('cart_applied_offer', {
  cartId: integer().notNull().references(() => carts.id, {
    onDelete: 'cascade',
  }),
  offerId: integer().notNull().references(() => offers.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
},  (t) => [
    primaryKey({
      columns: [t.cartId, t.offerId],
    }),
  ],
  )

export const cartLines = pgTable('cart_line', {
  id: serial().primaryKey(),
  cartId: integer().notNull().references(() => carts.id),
  variantId: integer().notNull().references(() => productVariants.id, {
    onDelete: 'cascade',
  }),
  quantity: integer().notNull(),
  // The buyer's answers to the product's custom fields, by label
  customizations: jsonb().notNull().default({}).$type<Record<string, string>>(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const cartAppliedVoucherOfferRelations = relations(cartAppliedVoucherOffers, ({ one }) => ({
  cart: one(carts, {
    fields: [cartAppliedVoucherOffers.cartId],
    references: [carts.id],
  }),
  offer: one(offers, {
    fields: [cartAppliedVoucherOffers.offerId],
    references: [offers.id],
  }),
}))

export const cartRelations = relations(carts, ({ many }) => ({
  lines: many(cartLines),
  appliedVoucherOffers: many(cartAppliedVoucherOffers),
}))

export const cartLineRelations = relations(cartLines, ({ one }) => ({
  cart: one(carts, {
    fields: [cartLines.cartId],
    references: [carts.id],
  }),
  variant: one(productVariants, {
    fields: [cartLines.variantId],
    references: [productVariants.id],
  }),
}))

export type Cart = typeof carts.$inferSelect
export type CartLine = typeof cartLines.$inferSelect
export type NewCartLine = typeof cartLines.$inferInsert