import { boolean, numeric } from 'drizzle-orm/pg-core'
import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const loyaltySettings = pgTable('loyalty_setting', {
  id: serial().primaryKey(),
  isEnabled: boolean().default(false),
  earnRate: numeric({
    precision: 100,
    scale: 20,
  }),
  redeemRate: numeric({
    precision: 100,
    scale: 20,
  }),
  expiresAfterInDays: integer(),
})

export const loyaltyPoints = pgTable('loyalty_point', {
  id: serial().primaryKey(),
  userId: text().notNull(),
  orderId: integer().notNull(),
  earnedPoints: numeric({
    precision: 100,
    scale: 20,
  }).notNull(),
  redeemedPoints: numeric({
    precision: 100,
    scale: 20,
  })
    .notNull()
    .default('0'),
  expiresAt: timestamp({
    withTimezone: true,
  }),
  createdAt: timestamp({
    withTimezone: true,
  }).defaultNow(),
  updatedAt: timestamp({
    withTimezone: true,
  }).defaultNow(),
})

export const loyaltyLogTypes = pgEnum('loyalty_log_type', ['earned', 'redeemed', 'unredeemed'])

export const loyaltyLogs = pgTable('loyalty_log', {
  id: serial().primaryKey(),
  userId: text().notNull(),
  orderId: integer().notNull(),
  points: numeric({
    precision: 100,
    scale: 20,
  }).notNull(),
  type: loyaltyLogTypes().notNull(),
  createdAt: timestamp({
    withTimezone: true,
  }).defaultNow(),
})

export type LoyaltySettings = typeof loyaltySettings.$inferInsert
export type UpdateLoyaltySettings = Partial<
  Omit<LoyaltySettings, 'id'>
>

export type LoyaltyPoints = typeof loyaltyPoints.$inferInsert
export type InsertLoyaltyPoints = Omit<LoyaltyPoints, 'id'>

export type LoyaltyLogs = typeof loyaltyLogs.$inferInsert
export type InsertLoyaltyLogs = Omit<LoyaltyLogs, 'id'>
