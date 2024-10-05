import { db } from '../core/db'

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
} from './schema'

export const productService = {
  createProduct: async (product: NewProduct) => {
    console.log('Creating product...', product)
    return await db.insert(products).values(product).returning()
  },
}
