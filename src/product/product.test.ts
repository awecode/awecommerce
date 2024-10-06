import { expect, it } from 'vitest'
import { productService } from './service'

it('should create a product', async () => {
  const product = await productService.createProduct({
    name: 'Test Product',
    description: 'Test Description',
    price: 100,
  })
  expect(product).toBeDefined()
  expect(product.name).toBe('Test Product')
  expect(product.description).toBe('Test Description')
  expect(product.price).toBe(100)
})
