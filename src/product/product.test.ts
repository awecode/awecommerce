import { expect, test } from 'vitest'
import { productService } from './service'

test('createProduct', async () => {
  const product = await productService.createProduct({
    name: 'Test Product',
    description: 'Test Description',
    price: 100,
  })
})
