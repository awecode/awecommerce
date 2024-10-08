import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const brands = pgTable('brand', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const categories = pgTable('category', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parentId: integer('parentId').references((): any => categories.id),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productClasses = pgTable('product_class', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const products = pgTable('product', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  brandId: integer('brandId').references(() => brands.id),
  categoryId: integer('categoryId').references(() => categories.id),
  productClassId: integer('productClassId').references(() => productClasses.id),
  link: text('link'),
  thumbnail: text('thumbnail'),
  price: integer('price').notNull(),
  status: productStatus('status').default('Draft'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productImages = pgTable('product_image', {
  id: serial('id').primaryKey(),
  productId: integer('productId').references(() => products.id),
  imageUrl: text('imageUrl').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
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
