import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  varchar,
  timestamp,
  text,
  primaryKey,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core'

export const brands = pgTable('brand', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  description: text(),
  order: integer().default(1),
  isActive: boolean().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const categories = pgTable('category', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  parentId: integer().references((): any => categories.id),
  description: text(),
  logo: text(),
  isActive: boolean().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productClasses = pgTable('product_class', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  trackStock: boolean().default(true),
  // Tax percentage for products of this class; empty uses the store default
  taxRate: numeric({ precision: 100, scale: 20 }),
  isActive: boolean().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const products = pgTable('product', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  specification: text(),
  brandId: integer().references(() => brands.id),
  categoryId: integer().references(() => categories.id),
  productClassId: integer().references(() => productClasses.id),
  link: text(),
  thumbnail: text(),
  status: productStatus().default('Draft'),
  isFeatured: boolean().default(false),
  isBestSeller: boolean().default(false),
  isActive: boolean().default(true),
  extraInfo: jsonb().default({}).$type<Record<string, any>>(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productRelatedProducts = pgTable('product_related_products', {
  productId: integer().references(() => products.id, {
    onDelete: 'cascade'
  }),
  relatedProductId: integer().references(() => products.id, {
    onDelete: 'cascade'
  }),
}, (t)=>({
  pk: primaryKey(t.productId, t.relatedProductId)
}))

export const productImages = pgTable('product_image', {
  id: serial().primaryKey(),
  productId: integer().references(() => products.id, {
    onDelete: 'cascade'
  }),
  imageUrl: text().notNull(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

// What is bought: a product has one variant per combination of its options,
// or a single variant without options
export const productVariants = pgTable('product_variant', {
  id: serial().primaryKey(),
  productId: integer().notNull().references(() => products.id, {
    onDelete: 'cascade',
  }),
  sku: text().notNull().unique(),
  // Short label such as "M / Red"; empty for a product without options
  title: text(),
  price: numeric({ precision: 100, scale: 20 }),
  discountedPrice: numeric({ precision: 100, scale: 20 }),
  inventoryCost: numeric({ precision: 100, scale: 20 }),
  stockQuantity: integer().default(0),
  // One of the product's images, shown when this variant is selected
  imageId: integer().references(() => productImages.id, {
    onDelete: 'set null',
  }),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

// An option of one product, such as Size
export const productOptions = pgTable('product_option', {
  id: serial().primaryKey(),
  productId: integer().notNull().references(() => products.id, {
    onDelete: 'cascade',
  }),
  name: text().notNull(),
}, (t) => [unique().on(t.productId, t.name)])

// A value of an option, such as M
export const productOptionValues = pgTable('product_option_value', {
  id: serial().primaryKey(),
  optionId: integer().notNull().references(() => productOptions.id, {
    onDelete: 'cascade',
  }),
  value: text().notNull(),
}, (t) => [unique().on(t.optionId, t.value)])

export const productVariantOptionValues = pgTable('product_variant_option_value', {
  variantId: integer().notNull().references(() => productVariants.id, {
    onDelete: 'cascade',
  }),
  optionValueId: integer().notNull().references(() => productOptionValues.id, {
    onDelete: 'cascade',
  }),
}, (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })])

export const productRelations = relations(products, (({one, many})=>({
  variants: many(productVariants),
  options: many(productOptions),
  brand: one(brands, {
    fields: [products.brandId],
    references: [brands.id]
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id]
  }),
  productClass: one(productClasses, {
    fields: [products.productClassId],
    references: [productClasses.id]
  }),
  images: many(productImages),
  relatedProducts: many(productRelatedProducts,{
    relationName: 'relatedTo'
  }),
  relatedTo: many(productRelatedProducts,{
    relationName: 'relatedProduct'
  })
})))

export const productImageRelations = relations(productImages, (({one})=>({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id]
  })
})))

export const productVariantRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  image: one(productImages, {
    fields: [productVariants.imageId],
    references: [productImages.id],
  }),
  optionValues: many(productVariantOptionValues),
}))

export const productOptionRelations = relations(productOptions, ({ one, many }) => ({
  product: one(products, {
    fields: [productOptions.productId],
    references: [products.id],
  }),
  values: many(productOptionValues),
}))

export const productOptionValueRelations = relations(productOptionValues, ({ one, many }) => ({
  option: one(productOptions, {
    fields: [productOptionValues.optionId],
    references: [productOptions.id],
  }),
  variants: many(productVariantOptionValues),
}))

export const productVariantOptionValueRelations = relations(
  productVariantOptionValues,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [productVariantOptionValues.variantId],
      references: [productVariants.id],
    }),
    optionValue: one(productOptionValues, {
      fields: [productVariantOptionValues.optionValueId],
      references: [productOptionValues.id],
    }),
  }),
)

export const productClassRelations = relations(productClasses, (({many})=>({
  products: many(products)
})))

export const categoryRelations = relations(categories, (({many})=>({
  products: many(products)
})))

export const brandRelations = relations(brands, (({many})=>({
  products: many(products)
})))

export const productRelatedProductRelations = relations(productRelatedProducts, (({one})=>({
  product: one(products, {
    fields: [productRelatedProducts.productId],
    references: [products.id],
    relationName: 'relatedTo'
  }),
  relatedProduct: one(products, {
    fields: [productRelatedProducts.relatedProductId],
    references: [products.id],
    relationName: 'relatedProduct'
  })
})))

export const productViews = pgTable('product_view', {
  id: serial().primaryKey(),
  productId: integer().references(() => products.id, {
    onDelete: 'cascade'
  }),
  userId: text().notNull(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productViewRelations = relations(productViews, (({one})=>({
  product: one(products, {
    fields: [productViews.productId],
    references: [products.id]
  })
})))

type BaseEntity = {
  id: number
  createdAt: string
  updatedAt: string
}

export type ProductVariant = typeof productVariants.$inferSelect
// options maps an option name to its value, for example { Size: 'M' }
export type NewProductVariant = Omit<
  typeof productVariants.$inferInsert,
  keyof BaseEntity | 'productId'
> & {
  options?: Record<string, string>
}
export type UpdateProductVariant = Partial<NewProductVariant>

// The variant fields create the product's first variant
type FirstVariantFields = 'sku' | 'price' | 'discountedPrice' | 'inventoryCost' | 'stockQuantity'

export type Product = typeof products.$inferSelect
export type UpdateProduct = Partial<
  Omit<typeof products.$inferInsert, keyof BaseEntity> & {
    images?: string[]
    relatedProducts?: number[]
  }
>
export type NewProduct = Omit<typeof products.$inferInsert, keyof BaseEntity> &
  Pick<NewProductVariant, FirstVariantFields> & {
    images?: string[]
    relatedProducts?: number[]
  }

export type NewProductImage = Omit<typeof productImages.$inferInsert, keyof BaseEntity>
export type ProductImage = typeof productImages.$inferSelect
export type UpdateProductImage = Partial<NewProductImage>

export type NewProductClass = Omit<typeof productClasses.$inferInsert, keyof BaseEntity>
export type ProductClass = typeof productClasses.$inferSelect
export type UpdateProductClass = Partial<NewProductClass>

export type NewCategory = Omit<typeof categories.$inferInsert, keyof BaseEntity>
export type Category = typeof categories.$inferSelect
export type UpdateCategory = Partial<NewCategory>

export type NewBrand = Omit<typeof brands.$inferInsert, keyof BaseEntity>
export type Brand = typeof brands.$inferSelect
export type UpdateBrand = Partial<NewBrand>
