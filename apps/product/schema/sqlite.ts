import {
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm';

export const brands = sqliteTable('brand', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  slug: text().notNull(),
  description: text(),
  createdAt: text().default(sql`(current_timestamp)`),
  updatedAt: text().default(sql`(current_timestamp)`),
})

export const categories = sqliteTable('category', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  slug: text().notNull(),
  parentId: integer().references((): any => categories.id),
  description: text(),
  createdAt: text().default(sql`(current_timestamp)`),
  updatedAt: text().default(sql`(current_timestamp)`),
})

export const productClasses = sqliteTable('product_class', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  slug: text().notNull(),
  description: text(),
  createdAt: text().default(sql`(current_timestamp)`),
  updatedAt: text().default(sql`(current_timestamp)`),
})

export const products = sqliteTable('product', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  description: text().notNull(),
  brandId: integer().references(() => brands.id),
  categoryId: integer().references(() => categories.id),
  productClassId: integer().references(() => productClasses.id),
  link: text(),
  thumbnail: text(),
  price: integer().notNull(),
  status: text({ enum: ['Draft', 'Published'] }).default('Draft'),
  createdAt: text().default(sql`(current_timestamp)`),
  updatedAt: text().default(sql`(current_timestamp)`),
})

export const productImages = sqliteTable('product_image', {
  id: integer().primaryKey({ autoIncrement: true }),
  productId: integer().references(() => products.id),
  imageUrl: text().notNull(),
  createdAt: text().default(sql`(current_timestamp)`),
  updatedAt: text().default(sql`(current_timestamp)`),
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
