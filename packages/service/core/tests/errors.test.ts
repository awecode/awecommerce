import { beforeAll, expect, test } from 'vitest'

import { db } from 'core/db'
import { NotFoundError, ValidationError } from 'core/errors'
import { CartService } from 'apps/cart/services/cart'
import { LoyaltyService } from 'apps/loyalty/services/loyalty'
import { OfferService } from 'apps/offer/services/offer'
import { OrderService } from 'apps/order/services/order'
import { ProductService } from 'apps/product/services/product'

const cartService = new CartService(db)
const orderService = new OrderService(db)

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

const rejectsWith = async (
  promise: Promise<unknown>,
  ErrorClass: typeof NotFoundError | typeof ValidationError,
  message: string,
) => {
  const error = await promise.then(
    () => undefined,
    (e) => e,
  )
  expect(error).toBeInstanceOf(ErrorClass)
  expect(error.name).toBe(ErrorClass.name)
  expect(error.message).toBe(message)
}

test('missing records throw NotFoundError', async () => {
  const cart = await cartService.create('errors-user')

  await rejectsWith(cartService.addToCart(cart.id, 999999, 1), NotFoundError, 'Product variant not found: 999999')
  await rejectsWith(
    cartService.updateCustomizations(cart.id, 999999, {}),
    NotFoundError,
    'Cart line not found: 999999',
  )
  await rejectsWith(
    cartService.updateQuantity(cart.id, 999999, 2),
    NotFoundError,
    'Cart line not found: 999999',
  )
  await rejectsWith(cartService.removeFromCart(cart.id, 999999), NotFoundError, 'Cart line not found: 999999')
  await rejectsWith(
    cartService.getCartContentForSession('00000000-0000-0000-0000-000000000000'),
    NotFoundError,
    'Cart not found for session: 00000000-0000-0000-0000-000000000000',
  )
  await rejectsWith(
    cartService.getCartSummary(cart.sessionId, { shippingMethodId: 999999 }),
    NotFoundError,
    'Shipping method not found: 999999',
  )
  await rejectsWith(orderService.createFromCart(999999), NotFoundError, 'Cart not found: 999999')
  await rejectsWith(orderService.cancel(999999, 'admin', 'test'), NotFoundError, 'Order not found: 999999')
})

test('input the services cannot accept throws ValidationError', async () => {
  const product = await new ProductService(db).create({
    name: 'errors-product',
    slug: 'errors-product',
    sku: 'errors-product',
    price: '10',
    customFields: [{ label: 'Name', required: true, maxLength: 20 }],
  })
  const variantId = product.variants[0].id
  const cart = await cartService.create('errors-user')

  await rejectsWith(cartService.addToCart(cart.id, variantId, 0), ValidationError, 'Quantity must be at least 1')
  await rejectsWith(
    cartService.addToCart(cart.id, variantId, 1, { Colour: 'red' }),
    ValidationError,
    'Unknown field: Colour',
  )
  await rejectsWith(orderService.createFromCart(cart.id), ValidationError, 'Cannot create an order without lines')
  const content = await cartService.getCartContentForSession(cart.sessionId)
  await rejectsWith(
    new OfferService(db).applyVoucherCode(content, undefined, 'NO-SUCH-CODE', 'errors-user'),
    ValidationError,
    'Invalid voucher code',
  )
  await rejectsWith(
    new LoyaltyService(db).redemptionValue(null, 5),
    ValidationError,
    'Guests cannot redeem loyalty points',
  )
  await rejectsWith(
    new ProductService(db).create({
      name: 'errors-dupe',
      slug: 'errors-dupe',
      sku: 'errors-dupe',
      price: '10',
      customFields: [
        { label: 'A', required: false, maxLength: 5 },
        { label: 'A', required: false, maxLength: 5 },
      ],
    }),
    ValidationError,
    'Duplicate custom field label: A',
  )
})
