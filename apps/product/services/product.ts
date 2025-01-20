import { and, eq, like, or, SQL } from 'drizzle-orm'

import { NewProduct, Product, products } from '../schemas'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { PgliteDatabase } from 'drizzle-orm/pglite'

interface ProductFilter {
  brandId?: number
  categoryId?: number
  productClassId?: number
  status?: Product['status']
  search?: string // searches id or name
  isFeatured?: boolean
  isBestSeller?: boolean
}

class ProductService {
  private db:  NodePgDatabase<Record<string, never>>
    | PgliteDatabase<Record<string, never>>

  constructor(dbInstance:  NodePgDatabase<Record<string, never>>
    | PgliteDatabase<Record<string, never>>) {
    this.db = dbInstance
  }

  async create(product: NewProduct) {
    const result = await this.db.insert(products).values(product).returning()
    return result[0]
  }

  async get(productId: number) {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
    return result[0]
  }

  async getPrices(productId: number) {
    const result = await this.db
      .select({
        price: products.price,
        discountedPrice: products.discountedPrice,
      })
      .from(products)
      .where(eq(products.id, productId))
    return result[0]
  }

  async update(productId: number, product: Partial<Product>) {
    const result = await this.db
      .update(products)
      .set(product)
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async delete(productId: number) {
    const result = await this.db
      .delete(products)
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async filter(filter: ProductFilter) {
    const where: SQL[] = []

    if (filter.brandId) {
      where.push(eq(products.brandId, filter.brandId))
    }
    if (filter.categoryId) {
      where.push(eq(products.categoryId, filter.categoryId))
    }
    if (filter.productClassId) {
      where.push(eq(products.productClassId, filter.productClassId))
    }
    if (filter.status) {
      where.push(eq(products.status, filter.status))
    }
    if (filter.isFeatured !== undefined) {
      where.push(eq(products.isFeatured, filter.isFeatured))
    }
    if (filter.isBestSeller !== undefined) {
      where.push(eq(products.isBestSeller, filter.isBestSeller))
    }
    if (filter.search) {
      where.push(
        or(
          like(products.id, `%${filter.search}%`),
          like(products.name, `%${filter.search}%`),
        )!,
      )
    }

    const query = this.db
      .select()
      .from(products)
      .where(and(...where))

    const result = await query
    return result
  }

  async markAsFeatured(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isFeatured: true })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async unmarkAsFeatured(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isFeatured: false })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async markAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: true })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async unmarkAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: false })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }
}

export { ProductService }
