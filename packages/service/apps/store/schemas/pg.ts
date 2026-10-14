import { pgTable, serial, text } from 'drizzle-orm/pg-core'

// The store's own settings, a single row
export const storeSettings = pgTable('store_setting', {
  id: serial().primaryKey(),
  name: text().notNull().default(''),
  // ISO 4217 code, such as USD; prices are in this currency
  currency: text().notNull().default('USD'),
  // BCP 47 tag, such as en-US; how prices, numbers and dates are written
  locale: text().notNull().default('en-US'),
})

export type StoreSettings = typeof storeSettings.$inferSelect
export type UpdateStoreSettings = Partial<Omit<StoreSettings, 'id'>>
