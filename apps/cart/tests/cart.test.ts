import { faker } from '@faker-js/faker'
import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { cartService } from '../services/cart'
import { productService } from 'apps/product/services/product'

test('should create a cart', async () => {
  const cart = await cartService.create()
  expect(cart).toBeDefined()
  expect(cart.id).toBeDefined()
  expect(cart.userId).toBeNull()
  expect(cart.sessionId).toBeDefined()
})

test('should add a product to the cart', async () => {
  const cart = await cartService.create()
  const product = await productService.create({
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    price: faker.number.int({ min: 10, max: 100 }).toString(),
  })
  const { price, discountedPrice } = await productService.getPrices(product.id)
  const cartLine = await cartService.addToCart(cart.sessionId, product.id, 1)
  expect(cartLine).toBeDefined()
  expect(cartLine.cartId).toBe(cart.id)
  expect(cartLine.productId).toBe(product.id)
  expect(cartLine.price).toBe(discountedPrice || price)
  expect(cartLine.originalPrice).toBe(price)
})
