import { eq } from 'drizzle-orm'
import { db } from '../../../core/db'

import { NewProduct, Product, products } from '../schemas'

interface ProductFilter {
  brandId?: number
  categoryId?: number
  productClassId?: number
  status?: string
  search?: string // searches id or name
}

export const productService = {
  createProduct: async (product: NewProduct) => {
    const result = await db.insert(products).values(product).returning()
    return result[0]
  },

  filterProducts: async (filter: ProductFilter) => {
    const result = await db.select().from(products)
    return result
  },

}

