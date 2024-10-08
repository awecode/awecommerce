import { productService } from './service'
// import { client } from '../../core/db/pg/db'

export const seedProduct = async () => {
  console.log('Seeding product...')
  const product = await productService.createProduct({
    name: 'Test Product',
    description: 'Test Description',
    price: 100,
  })
  console.log('Product seeded:', product)
}

const main = async () => {
  await seedProduct()
  // await client.end()
}

main()
