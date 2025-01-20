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
} from 'drizzle-orm/pg-core'

export const brands = pgTable('brand', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  slug: varchar({ length: 100 }).notNull(),
  description: text(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const categories = pgTable('category', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  slug: varchar({ length: 100 }).notNull(),
  parentId: integer().references((): any => categories.id),
  description: text(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productClasses = pgTable('product_class', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  slug: varchar({ length: 100 }).notNull(),
  description: text(),
  trackStock: boolean().default(true),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productStatus = pgEnum('product_status', ['Draft', 'Published'])

export const products = pgTable('product', {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  specification: text(),
  brandId: integer().references(() => brands.id),
  categoryId: integer().references(() => categories.id),
  productClassId: integer().references(() => productClasses.id),
  link: varchar({ length: 256 }),
  thumbnail: varchar({ length: 256 }),
  price: numeric({ precision: 100 }),
  discountedPrice: numeric({ precision: 100 }),
  inventoryCost: numeric({ precision: 100 }),
  status: productStatus().default('Draft'),
  stockQuantity: integer().default(0),
  isFeatured: boolean().default(false),
  isBestSeller: boolean().default(false),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})

export const productRelatedProducts = pgTable('product_related_products', {
  productId: integer().references(() => products.id),
  relatedProductId: integer().references(() => products.id),
}, (t)=>({
  pk: primaryKey(t.productId, t.relatedProductId)
}))

export const productImages = pgTable('product_image', {
  id: serial().primaryKey(),
  productId: integer().references(() => products.id),
  imageUrl: varchar({ length: 256 }).notNull(),
  createdAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp({ mode: 'string', withTimezone: true }).defaultNow(),
})


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
