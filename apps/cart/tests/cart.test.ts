import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'

import {db} from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import { ProductService } from 'apps/product/services/product'


const cartService = new CartService(db)
const productService = new ProductService(db)


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
  const line1 = await cartService.addToCart(cart1.sessionId, product1.id, 2)
  const product2 = await createProduct()
  const line2 = await cartService.addToCart(cart2.sessionId, product2.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.cart.userId).toBe(cart1.userId)
  expect(mergedCart.cart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(2)
  // Line 1 should not be on merged cart
  expect(mergedCart.lines.find((l) => l.id === line1.id)).toBeUndefined()
  // Product from line 1 should be on merged cart with a different line id
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id)?.id,
  ).not.toBe(line1.id)
  // Line 1's product should be on merged cart with same values except line id
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id),
  ).toBeDefined()
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id)?.quantity,
  ).toBe(line1.quantity)
  expect(mergedCart.lines.find((l) => l.productId === product1.id)?.price).toBe(
    line1.price,
  )
  expect(
    mergedCart.lines.find((l) => l.productId === product1.id)?.originalPrice,
  ).toBe(line1.originalPrice)
  // Line 2 should be on merged cart with same id
  expect(mergedCart.lines.find((l) => l.id === line2.id)).toBeDefined()
})

test('should merge carts with same product and sum quantity', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  await cartService.addToCart(cart1.sessionId, product1.id, 2)
  await cartService.addToCart(cart2.sessionId, product1.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
    true,
  )
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].quantity).toBe(5)
})

test('should merge carts with same product and not sum quantity', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const cart2 = await cartService.create()
  const product1 = await createProduct()
  await cartService.addToCart(cart1.sessionId, product1.id, 2)
  const line2 = await cartService.addToCart(cart2.sessionId, product1.id, 3)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
    false,
  )
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].quantity).toBe(line2.quantity)
})

test('should merge carts when session cart is invalid', async () => {
  const cart1 = await cartService.create('123') //123 is userId
  const product1 = await createProduct()
  await cartService.addToCart(cart1.sessionId, product1.id, 2)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    '123e4567-e89b-12d3-a456-426614174000', // dummy uuid
  )
  expect(mergedCart.cart.userId).toBe(cart1.userId)
  expect(mergedCart.cart.sessionId).toBe(cart1.sessionId)
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].productId).toBe(product1.id)
  expect(mergedCart.lines[0].quantity).toBe(2)
})

test('should return user cart for merge when session cart is empty', async () => {
  const cart1 = await cartService.create('1234') //1234 is userId
  const product1 = await createProduct()
  await cartService.addToCart(cart1.sessionId, product1.id, 2)
  const cart2 = await cartService.create()
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.cart.userId).toBe(cart1.userId)
  expect(mergedCart.cart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(1)
})

test('should return session cart for merge when user cart is empty', async () => {
  const cart1 = await cartService.create('12345') //1234 is userId
  const cart2 = await cartService.create()
  const product2 = await createProduct()
  await cartService.addToCart(cart2.sessionId, product2.id, 2)
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!, // dummy uuid
    cart2.sessionId,
  )
  expect(mergedCart.cart.userId).toBe(cart1.userId)
  expect(mergedCart.cart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(1)
  expect(mergedCart.lines[0].productId).toBe(product2.id)
  expect(mergedCart.lines[0].quantity).toBe(2)
})

test('should return empty cart for merge when both user and session cart are empty', async () => {
  const cart1 = await cartService.create('123456') //12345 is userId
  const cart2 = await cartService.create()
  const mergedCart = await cartService.mergeCarts(
    cart1.userId!,
    cart2.sessionId,
  )
  expect(mergedCart.cart.userId).toBe(cart1.userId)
  expect(mergedCart.cart.sessionId).toBe(cart2.sessionId)
  expect(mergedCart.lines.length).toBe(0)
})