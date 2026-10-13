import { boolean, numeric, pgTable, serial } from 'drizzle-orm/pg-core'

// Store-wide tax settings, kept as a single row
export const taxSettings = pgTable('tax_setting', {
  id: serial().primaryKey(),
  // Whether product and shipping prices already include tax
  pricesIncludeTax: boolean().notNull().default(false),
  // Percentage, for example 13 for 13%. Used when a product class has no rate.
  defaultRate: numeric({
    precision: 100,
    scale: 20,
  })
    .notNull()
    .default('0'),
  // Whether shipping is taxed, at the default rate
  taxShipping: boolean().notNull().default(false),
})

export type TaxSettings = typeof taxSettings.$inferInsert
export type UpdateTaxSettings = Partial<Omit<TaxSettings, 'id'>>
