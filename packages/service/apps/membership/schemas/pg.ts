import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { orders } from '../../order/schemas/pg'
import { productVariants } from '../../product/schemas/pg'

// A tier, such as Platinum. Plans with the same `program` (such as `music`)
// are tiers of one membership: a person has at most one of them at a time,
// and `rank` orders them (higher is better).
export const membershipPlans = pgTable('membership_plan', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  program: text().notNull(),
  rank: integer().notNull().default(0),
  description: text(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
})

// How a plan is sold: the product variant that grants it, for how many
// months. Its price and whether it is on sale are the variant's.
export const membershipTerms = pgTable('membership_term', {
  id: serial().primaryKey(),
  planId: integer()
    .notNull()
    .references(() => membershipPlans.id, { onDelete: 'cascade' }),
  variantId: integer()
    .notNull()
    .unique()
    .references(() => productVariants.id, { onDelete: 'cascade' }),
  months: integer().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
})

export const membershipStatus = pgEnum('membership_status', ['active', 'cancelled'])

// One membership: a plan for a person from `startsAt` until `endsAt`. It
// counts while it is active and the time is between the two, so expiry needs
// no job. Granted by staff (`grantedBy`) or bought (`orderId`).
export const memberships = pgTable('membership', {
  id: serial().primaryKey(),
  userId: text().notNull(),
  planId: integer()
    .notNull()
    .references(() => membershipPlans.id),
  months: integer().notNull(),
  pricePaid: numeric({ precision: 100, scale: 20 }),
  startsAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  endsAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  status: membershipStatus().notNull().default('active'),
  orderId: integer().references(() => orders.id),
  grantedBy: text(),
  cancelledAt: timestamp({ withTimezone: true, mode: 'string' }),
  cancellationReason: text(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
})

export const membershipPlanRelations = relations(membershipPlans, ({ many }) => ({
  terms: many(membershipTerms),
}))

export const membershipTermRelations = relations(membershipTerms, ({ one }) => ({
  plan: one(membershipPlans, {
    fields: [membershipTerms.planId],
    references: [membershipPlans.id],
  }),
  variant: one(productVariants, {
    fields: [membershipTerms.variantId],
    references: [productVariants.id],
  }),
}))

export const membershipRelations = relations(memberships, ({ one }) => ({
  plan: one(membershipPlans, {
    fields: [memberships.planId],
    references: [membershipPlans.id],
  }),
}))

export type MembershipPlan = typeof membershipPlans.$inferSelect
export type NewMembershipPlan = Omit<typeof membershipPlans.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type MembershipTerm = typeof membershipTerms.$inferSelect
export type NewMembershipTerm = Omit<typeof membershipTerms.$inferInsert, 'id' | 'createdAt'>
export type Membership = typeof memberships.$inferSelect
