import { faker } from '@faker-js/faker'
import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { cartService } from '../services/cart'
import { productService } from 'apps/product/services/product'

const createProduct = async () => {
  return await productService.create({
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    price: faker.number.int({ min: 10, max: 100 }).toString(),
  })
}

test('should create a cart', async () => {
  const cart = await cartService.create()
  expect(cart).toBeDefined()
  expect(cart.id).toBeDefined()
  expect(cart.userId).toBeNull()
  expect(cart.sessionId).toBeDefined()
})

test('should add a product to the cart', async () => {
  const cart = await cartService.create()
  const product = await createProduct()
  const { price, discountedPrice } = await productService.getPrices(product.id)
  const cartLine = await cartService.addToCart(cart.sessionId, product.id, 1)
  expect(cartLine).toBeDefined()
  expect(cartLine.cartId).toBe(cart.id)
  expect(cartLine.productId).toBe(product.id)
  expect(cartLine.price).toBe(discountedPrice || price)
  expect(cartLine.originalPrice).toBe(price)
})

test('should get cart content for session', async () => {
  const cart = await cartService.create()
  const product1 = await createProduct()
  const product2 = await createProduct()
  await cartService.addToCart(cart.sessionId, product1.id, 1)
  await cartService.addToCart(cart.sessionId, product2.id, 1)
  const cartContent = await cartService.getCartContentForSession(cart.sessionId)
  expect(cartContent).toBeDefined()
  expect(cartContent.cart).toBeDefined()
  expect(cartContent.lines[0].price.toString()).toBe(product1.discountedPrice || product1.price)
  expect(cartContent.lines[1].price.toString()).toBe(product2.discountedPrice || product2.price)
})

test('should merge carts', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  await cartService.addToCart(cart1.sessionId, product1.id, 2)
  const product2 = await createProduct()
  await cartService.addToCart(cart2.sessionId, product2.id, 3)
  const mergedCart = await cartService.mergeCarts(cart1.userId!, cart2.sessionId)
  console.log(mergedCart)
  // const cartContent = await cartService.getCartContentForSession(cart1.sessionId)
  // expect(cartContent).toBeDefined()
  // expect(cartContent.cart).toBeDefined()
  // expect(cartContent.lines[0].price.toString()).toBe(product1.discountedPrice || product1.price)
  // expect(cartContent.lines[1].price.toString()).toBe(product2.discountedPrice || product2.price)
})
