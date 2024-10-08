import { db } from '../../core/db'

import {
  NewProduct,
  Product,
  NewProductImage,
  ProductImage,
  NewProductClass,
  ProductClass,
  NewCategory,
  Category,
  NewBrand,
  Brand,
  products,
} from './schema/pg'

export const productService = {
  createProduct: async (product: NewProduct) => {
    const result = await db.insert(products).values(product).returning()
    return result[0]
  },
}
