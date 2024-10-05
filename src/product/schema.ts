import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const brand = pgTable('brand', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const category = pgTable('category', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parentId: integer('parentId').references((): any => category.id),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productClass = pgTable('product_class', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const product = pgTable('product', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  brandId: integer('brandId').references(() => brand.id),
  categoryId: integer('categoryId').references(() => category.id),
  productClassId: integer('productClassId').references(() => productClass.id),
  link: text('link'),
  thumbnail: text('thumbnail'),
  price: integer('price').notNull(),
  status: productStatus('status').default('Draft'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const productImage = pgTable('product_image', {
  id: serial('id').primaryKey(),
  productId: integer('productId').references(() => product.id),
  imageUrl: text('imageUrl').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})
