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
} from 'drizzle-orm/pg-core'

export const brands = pgTable('brand', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  description: text(),
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
  isActive: boolean().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const products = pgTable('product', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  sku: text().notNull().unique(),
  description: text(),
  specification: text(),
  brandId: integer().references(() => brands.id),
  categoryId: integer().references(() => categories.id),
  productClassId: integer().references(() => productClasses.id),
  link: text(),
  thumbnail: text(),
  price: numeric({ precision: 100 }),
  discountedPrice: numeric({ precision: 100 }),
  inventoryCost: numeric({ precision: 100 }),
  status: productStatus().default('Draft'),
  stockQuantity: integer().default(0),
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

export const productRelations = relations(products, (({one, many})=>({
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

export type Product = typeof products.$inferSelect
export type NewProduct = Omit<typeof products.$inferInsert, keyof BaseEntity> & {
  images?: string[]
  relatedProducts?: number[]
}
export type UpdateProduct = Partial<NewProduct>

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
