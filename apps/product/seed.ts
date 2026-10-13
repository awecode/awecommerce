import { db } from '../../core/db'
import { closeDb } from '../../core/db/pg/db'
import { ProductService } from './services/product'

const productService = new ProductService(db)

export const seedProduct = async () => {
  console.log('Seeding product...')
  const product = await productService.create({
    name: 'Test Product',
    slug: 'test-product',
    sku: 'TEST-PRODUCT',
    description: 'Test Description',
    price: '100',
  })
  console.log('Product seeded:', product)
}

const main = async () => {
  await seedProduct()
  await closeDb()
}

main()
