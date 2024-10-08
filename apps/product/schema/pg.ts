import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const brands = pgTable('brand', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull(),
  description: text(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const categories = pgTable('category', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull(),
  parentId: integer().references((): any => categories.id),
  description: text(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const productClasses = pgTable('product_class', {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull(),
  description: text(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const products = pgTable('product', {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  brandId: integer().references(() => brands.id),
  categoryId: integer().references(() => categories.id),
  productClassId: integer().references(() => productClasses.id),
  link: text(),
  thumbnail: text(),
  price: integer().notNull(),
  status: productStatus('status').default('Draft'),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export const productImages = pgTable('product_image', {
  id: serial().primaryKey(),
  productId: integer().references(() => products.id),
  imageUrl: text().notNull(),
  createdAt: timestamp().defaultNow(),
  updatedAt: timestamp().defaultNow(),
})

export type NewProduct = typeof products.$inferInsert
export type Product = typeof products.$inferSelect

export type NewProductImage = typeof productImages.$inferInsert
export type ProductImage = typeof productImages.$inferSelect

export type NewProductClass = typeof productClasses.$inferInsert
export type ProductClass = typeof productClasses.$inferSelect

export type NewCategory = typeof categories.$inferInsert
export type Category = typeof categories.$inferSelect

export type NewBrand = typeof brands.$inferInsert
export type Brand = typeof brands.$inferSelect
