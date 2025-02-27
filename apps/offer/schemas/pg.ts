import { relations } from 'drizzle-orm'
import { orders } from '../../order/schemas'
import {
  brands,
  categories,
  productClasses,
  products,
} from '../../product/schemas'
import {
  pgEnum,
  timestamp,
  boolean,
  integer,
  text,
  pgTable,
  serial,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core'
import { numeric } from 'drizzle-orm/pg-core'

export const offerRanges = pgTable('offer_range', {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text(),
  isActive: boolean().default(true),
  inclusiveFilter: boolean().default(false),
  includeAllProducts: boolean().default(false),
  includeAllCategories: boolean().default(false),
  includeAllBrands: boolean().default(false),
  includeAllProductClasses: boolean().default(false),
  createdAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
})

export const offerRangeIncludedProducts = pgTable(
  'offer_range_included_product',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    productId: integer().references(() => products.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.productId],
    }),
  ],
)

export const offerRangeExcludedProducts = pgTable(
  'offer_range_excluded_product',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    productId: integer().references(() => products.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.productId],
    }),
  ],
)

export const offerRangeIncludedCategories = pgTable(
  'offer_range_included_category',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    categoryId: integer().references(() => categories.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.categoryId],
    }),
  ],
)

export const offerRangeExcludedCategories = pgTable(
  'offer_range_excluded_category',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    categoryId: integer().references(() => categories.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.categoryId],
    }),
  ],
)

export const offerRangeIncludedBrands = pgTable(
  'offer_range_included_brand',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    brandId: integer().references(() => brands.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.brandId],
    }),
  ],
)

export const offerRangeExcludedBrands = pgTable(
  'offer_range_excluded_brand',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    brandId: integer().references(() => brands.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.brandId],
    }),
  ],
)

export const offerRangeIncludedProductClasses = pgTable(
  'offer_range_included_product_class',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    productClassId: integer().references(() => productClasses.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.productClassId],
    }),
  ],
)

export const offerRangeExcludedProductClasses = pgTable(
  'offer_range_excluded_product_class',
  {
    rangeId: integer().references(() => offerRanges.id, {
      onDelete: 'cascade',
    }),
    productClassId: integer().references(() => productClasses.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({
      columns: [t.rangeId, t.productClassId],
    }),
  ],
)

export const offerBenefitType = pgEnum('offer_benefit_type', [
  'fixed_amount',
  'percentage',
  'free_shipping',
  'fixed_price',
])

export const offerBenefits = pgTable('offer_benefit', {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text(),
  isActive: boolean().default(true),
  type: offerBenefitType().notNull(),
  value: numeric().notNull(),
  maxAffectedItems: integer(),
  createdAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
})

export const offerConditionType = pgEnum('offer_condition_type', [
  'basket_quantity',
  'basket_total',
  'distinct_items',
])

export const offerConditions = pgTable('offer_condition', {
  id: serial().primaryKey(),
  rangeId: integer().references(() => offerRanges.id).notNull(),
  type: offerConditionType().notNull(),
  value: numeric().notNull(),
  createdAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
})

export const offerType = pgEnum('offer_type', ['site', 'voucher', 'user'])

export const offers = pgTable('offer', {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text(),
  image: text(),
  type: offerType().notNull(),
  voucherCode: text().unique(),
  includeAllUsers: boolean().default(false),
  includedUserIds: jsonb().default([]),
  conditionId: integer().references(() => offerConditions.id).notNull(),
  benefitId: integer().references(() => offerBenefits.id).notNull(),
  startDate: timestamp({
    withTimezone: true,
    mode: 'string',
  }),
  endDate: timestamp({
    withTimezone: true,
    mode: 'string',
  }),
  isActive: boolean().default(true),
  isFeatured: boolean().default(false),
  priority: integer().default(0),
  limitPerUser: integer(),
  overallLimit: integer(),
  usageCount: integer().default(0),
  createdAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  updatedAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
  metadata: jsonb().default({}),
})

export const offerApplicationLogs = pgTable('offer_application_log', {
  id: serial().primaryKey(),
  offerId: integer(),
  orderId: integer(),
  userId: text(),
  remarks: text(),
  createdAt: timestamp({
    withTimezone: true,
    mode: 'string',
  }).defaultNow(),
})

export const offerUsages = pgTable('offer_usage', {
  id: serial().primaryKey(),
  offerId: integer(),
  userId: text(),
  usageCount: integer().default(1),
})

export const offerRangeRelations = relations(offerRanges, ({ many }) => ({
  includedProducts: many(offerRangeIncludedProducts),
  excludedProducts: many(offerRangeExcludedProducts),
  includedCategories: many(offerRangeIncludedCategories),
  excludedCategories : many(offerRangeExcludedCategories),
  includedBrands: many(offerRangeIncludedBrands),
  excludedBrands : many(offerRangeExcludedBrands),
  includedProductClasses: many(offerRangeIncludedProductClasses),
  excludedProductClasses : many(offerRangeExcludedProductClasses),
}))

export const offerBenefitRelations = relations(offerBenefits, ({ one }) => ({
  offers: one(offers, {
    fields: [offerBenefits.id],
    references: [offers.benefitId],
  }),
}))

export const offerConditionRelations = relations(
  offerConditions,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerConditions.rangeId],
      references: [offerRanges.id],
    }),
  }),
)

export const offerRelations = relations(offers, ({ one }) => ({
  condition: one(offerConditions, {
    fields: [offers.conditionId],
    references: [offerConditions.id],
  }),
  benefit: one(offerBenefits, {
    fields: [offers.benefitId],
    references: [offerBenefits.id],
  }),
}))

export const offerRangeIncludedProductRelations = relations(
  offerRangeIncludedProducts,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeIncludedProducts.rangeId],
      references: [offerRanges.id],
    }),
    product: one(products, {
      fields: [offerRangeIncludedProducts.productId],
      references: [products.id],
    }),
  }),
)

export const offerRangeExcludedProductRelations = relations(
  offerRangeExcludedProducts,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeExcludedProducts.rangeId],
      references: [offerRanges.id],
    }),
    product: one(products, {
      fields: [offerRangeExcludedProducts.productId],
      references: [products.id],
    }),
  }),
)

export const offerRangeIncludedCategoryRelations = relations(
  offerRangeIncludedCategories,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeIncludedCategories.rangeId],
      references: [offerRanges.id],
    }),
    category: one(categories, {
      fields: [offerRangeIncludedCategories.categoryId],
      references: [categories.id],
    }),
  }),
)

export const offerRangeExcludedCategoryRelations = relations(
  offerRangeExcludedCategories,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeExcludedCategories.rangeId],
      references: [offerRanges.id],
    }),
    category: one(categories, {
      fields: [offerRangeExcludedCategories.categoryId],
      references: [categories.id],
    }),
  }),
)


export const offerRangeIncludedBrandRelations = relations(
  offerRangeIncludedBrands,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeIncludedBrands.rangeId],
      references: [offerRanges.id],
    }),
    brand: one(brands, {
      fields: [offerRangeIncludedBrands.brandId],
      references: [brands.id],
    }),
  }),
)

export const offerRangeExcludedBrandRelations = relations(
  offerRangeExcludedBrands,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeExcludedBrands.rangeId],
      references: [offerRanges.id],
    }),
    brand: one(brands, {
      fields: [offerRangeExcludedBrands.brandId],
      references: [brands.id],
    }),
  }),
)

export const offerRangeIncludedProductClassRelations = relations(
  offerRangeIncludedProductClasses,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeIncludedProductClasses.rangeId],
      references: [offerRanges.id],
    }),
    productClass: one(productClasses, {
      fields: [offerRangeIncludedProductClasses.productClassId],
      references: [productClasses.id],
    }),
  }),
)

export const offerRangeExcludedProductClassRelations = relations(
  offerRangeExcludedProductClasses,
  ({ one }) => ({
    range: one(offerRanges, {
      fields: [offerRangeExcludedProductClasses.rangeId],
      references: [offerRanges.id],
    }),
    productClass: one(productClasses, {
      fields: [offerRangeExcludedProductClasses.productClassId],
      references: [productClasses.id],
    }),
  }),
)

export const offerApplicationLogRelations = relations(
  offerApplicationLogs,
  ({ one }) => ({
    offer: one(offers, {
      fields: [offerApplicationLogs.offerId],
      references: [offers.id],
    }),
    order: one(orders, {
      fields: [offerApplicationLogs.orderId],
      references: [orders.id],
    }),
  }),
)

export type Offer = typeof offers.$inferSelect
export type NewOffer = Omit<
  typeof offers.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type UpdateOffer = Partial<NewOffer>

export type OfferRange = typeof offerRanges.$inferSelect
export type NewOfferRange = Omit<
  typeof offerRanges.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
> & {
  includedProducts?: number[]
  excludedProducts?: number[]
  includedCategories?: number[]
  includedBrands?: number[]
  includedProductClasses?: number[]
  excludedCategories?: number[]
  excludedBrands?: number[]
  excludedProductClasses?: number[]
}
export type UpdateOfferRange = Partial<NewOfferRange>

export type OfferBenefit = typeof offerBenefits.$inferSelect
export type NewOfferBenefit = Omit<
  typeof offerBenefits.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type UpdateOfferBenefit = Partial<NewOfferBenefit>

export type OfferCondition = typeof offerConditions.$inferSelect
export type NewOfferCondition = Omit<
  typeof offerConditions.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type UpdateOfferCondition = Partial<NewOfferCondition>

export type OfferApplicationLog = typeof offerApplicationLogs.$inferSelect
export type NewOfferApplicationLog = Omit<
  typeof offerApplicationLogs.$inferInsert,
  'id' | 'createdAt'
>
export type UpdateOfferApplicationLog = Partial<NewOfferApplicationLog>
