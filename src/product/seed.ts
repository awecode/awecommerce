import { productService } from './service'

export const seedProduct = async () => {
  console.log('Seeding product...')
  const product = await productService.createProduct({
    name: 'Test Product',
    description: 'Test Description',
    price: 100,
  })
  console.log('Product seeded:', product)
}

seedProduct()