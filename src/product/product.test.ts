import { expect, it } from 'vitest'
import { productService } from './service'
import { faker } from '@faker-js/faker'

it('should create a product', async () => {
  const name = faker.commerce.productName()
  const description = faker.commerce.productDescription()
  const price = faker.number.int({ min: 10, max: 100 })
  const product = await productService.createProduct({
    name,
    description,
    price,
  })
  expect(product).toBeDefined()
  expect(product.name).toBe(name)
  expect(product.description).toBe(description)
  expect(product.price).toBe(price)
})
