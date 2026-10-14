import { beforeAll, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'

import { db } from 'core/db'
import { CartService } from 'apps/cart/services/cart'
import {
  CustomizationsNoLongerValidError,
  OrderService,
} from 'apps/order/services/order'
import { ProductService } from 'apps/product/services/product'
import { cartLines, carts } from 'apps/cart/schemas'
import { orderLines, orders } from 'apps/order/schemas'

const cartService = new CartService(db)
const productService = new ProductService(db)

const jerseyFields = [
  { label: 'Print name', required: true, maxLength: 12 },
  { label: 'Number', required: false, maxLength: 2 },
]

let count = 0
const createJersey = async (customFields = jerseyFields) => {
  const slug = `jersey-${++count}`
  return await productService.create({
    name: 'Jersey',
    slug,
    sku: slug,
    price: '50',
    customFields,
  })
}

const linesOf = async (cartId: number) =>
  await db.select().from(cartLines).where(eq(cartLines.cartId, cartId))

beforeAll(() => {
  process.env.ORDER_HASH_SECRET = 'test-secret'
})

test('should let a product declare custom fields', async () => {
  const jersey = await createJersey()
  expect(jersey.customFields).toEqual(jerseyFields)

  const plain = await productService.create({
    name: 'Mug',
    slug: `mug-${++count}`,
    sku: `mug-${count}`,
    price: '10',
  })
  expect(plain.customFields).toEqual([])
})

test('should store the answers on the cart line', async () => {
  const jersey = await createJersey()
  const cart = await cartService.create('custom-store-user')

  const line = await cartService.addToCart(cart.id, jersey.variants[0].id, 1, {
    'Print name': 'Dipesh',
    Number: '10',
  })

  expect(line.customizations).toEqual({ 'Print name': 'Dipesh', Number: '10' })
})

test('should reject a missing required answer and an answer that is too long', async () => {
  const jersey = await createJersey()
  const variantId = jersey.variants[0].id
  const cart = await cartService.create('custom-reject-user')

  await expect(cartService.addToCart(cart.id, variantId, 1)).rejects.toThrow(
    'Missing required field: Print name',
  )
  await expect(
    cartService.addToCart(cart.id, variantId, 1, { 'Print name': '   ' }),
  ).rejects.toThrow('Missing required field: Print name')
  await expect(
    cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Bartholomew Jr' }),
  ).rejects.toThrow('Field is too long: Print name (max 12 characters)')
  await expect(
    cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Dipesh', Number: '100' }),
  ).rejects.toThrow('Field is too long: Number (max 2 characters)')
  await expect(
    cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Dipesh', Size: 'M' }),
  ).rejects.toThrow('Unknown field: Size')
  expect(await linesOf(cart.id)).toEqual([])
})

test('should keep different answers on separate lines and add up matching ones', async () => {
  const jersey = await createJersey()
  const variantId = jersey.variants[0].id
  const cart = await cartService.create('custom-lines-user')

  await cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Dipesh', Number: '10' })
  await cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Ram' })
  // Same answers, in a different key order, and an empty optional answer
  await cartService.addToCart(cart.id, variantId, 2, { Number: '10', 'Print name': 'Dipesh' })
  await cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Ram', Number: '' })

  const lines = await linesOf(cart.id)
  expect(
    lines.map((l) => [l.customizations, l.quantity]).sort((a, b) => (a[1] as number) - (b[1] as number)),
  ).toEqual([
    [{ 'Print name': 'Ram' }, 2],
    [{ 'Print name': 'Dipesh', Number: '10' }, 3],
  ])
})

test('should add up the quantity of a product without fields', async () => {
  const mug = await productService.create({
    name: 'Mug',
    slug: `mug-${++count}`,
    sku: `mug-${count}`,
    price: '10',
  })
  const cart = await cartService.create('custom-plain-user')

  await cartService.addToCart(cart.id, mug.variants[0].id, 1)
  await cartService.addToCart(cart.id, mug.variants[0].id, 2)

  const lines = await linesOf(cart.id)
  expect(lines.map((l) => [l.quantity, l.customizations])).toEqual([[3, {}]])
})

test('should copy both names onto the order at checkout', async () => {
  const jersey = await createJersey()
  const variantId = jersey.variants[0].id
  const cart = await cartService.create('custom-order-user')
  await cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Dipesh', Number: '10' })
  await cartService.addToCart(cart.id, variantId, 1, { 'Print name': 'Ram' })

  const order = await new OrderService(db).createFromCart(cart.id)

  const saved = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id))
  expect(saved.map((l) => l.customizations)).toEqual(
    expect.arrayContaining([{ 'Print name': 'Dipesh', Number: '10' }, { 'Print name': 'Ram' }]),
  )
  expect(saved).toHaveLength(2)
})

test('should keep the order answers when the product fields change later', async () => {
  const jersey = await createJersey()
  const cart = await cartService.create('custom-snapshot-user')
  await cartService.addToCart(cart.id, jersey.variants[0].id, 1, { 'Print name': 'Dipesh' })
  const order = await new OrderService(db).createFromCart(cart.id)

  await productService.update(jersey.id, {
    customFields: [{ label: 'Initials', required: true, maxLength: 3 }],
  })
  await productService.update(jersey.id, { customFields: [] })

  const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id))
  expect(line.customizations).toEqual({ 'Print name': 'Dipesh' })
})

test('should keep different answers apart when merging a guest cart', async () => {
  const jersey = await createJersey()
  const variantId = jersey.variants[0].id
  const userId = 'custom-merge-user'
  const userCart = await cartService.create(userId)
  await cartService.addToCart(userCart.id, variantId, 1, { 'Print name': 'Dipesh' })
  await cartService.addToCart(userCart.id, variantId, 1, { 'Print name': 'Hari' })
  const guestCart = await cartService.create()
  await cartService.addToCart(guestCart.id, variantId, 2, { 'Print name': 'Ram' })
  await cartService.addToCart(guestCart.id, variantId, 1, { 'Print name': 'Hari' })

  const merged = await cartService.mergeCarts(userId, guestCart.sessionId)

  expect(
    merged.lines
      .map((l) => [l.customizations['Print name'], l.quantity])
      .sort(),
  ).toEqual([
    ['Dipesh', 1],
    ['Hari', 2],
    ['Ram', 2],
  ])
})

test('should fail checkout when the answers no longer fit the product fields', async () => {
  const changes = [
    {
      customFields: [...jerseyFields, { label: 'Initials', required: true, maxLength: 3 }],
      reason: 'Missing required field: Initials',
    },
    {
      customFields: [{ label: 'Print name', required: true, maxLength: 4 }, jerseyFields[1]],
      reason: 'Field is too long: Print name (max 4 characters)',
    },
    {
      customFields: [jerseyFields[0]],
      reason: 'Unknown field: Number',
    },
  ]
  for (const [index, change] of changes.entries()) {
    const jersey = await createJersey()
    const cart = await cartService.create(`custom-changed-user-${index}`)
    const line = await cartService.addToCart(cart.id, jersey.variants[0].id, 1, {
      'Print name': 'Dipesh',
      Number: '10',
    })
    await productService.update(jersey.id, { customFields: change.customFields })

    const error = await new OrderService(db).createFromCart(cart.id).catch((e) => e)

    expect(error).toBeInstanceOf(CustomizationsNoLongerValidError)
    expect(error.message).toBe(`Customizations are no longer valid for Jersey: ${change.reason}`)
    expect([error.cartLineId, error.productName, error.reason]).toEqual([
      line.id,
      'Jersey',
      change.reason,
    ])
    expect(await db.select().from(orders).where(eq(orders.cartId, cart.id))).toEqual([])
    const [cartAfter] = await db.select().from(carts).where(eq(carts.id, cart.id))
    expect(cartAfter.status).toBe('Open')
  }
})

test('should reject invalid custom fields when creating or updating a product', async () => {
  const invalid: Array<[unknown[], string]> = [
    [[{ label: '  ', required: true, maxLength: 5 }], 'Custom field label is required'],
    [
      [
        { label: 'Name', required: true, maxLength: 5 },
        { label: 'Name', required: false, maxLength: 3 },
      ],
      'Duplicate custom field label: Name',
    ],
    [
      [{ label: 'Name', required: true, maxLength: 0 }],
      'Custom field maxLength must be a positive whole number: Name',
    ],
    [
      [{ label: 'Name', required: true, maxLength: 2.5 }],
      'Custom field maxLength must be a positive whole number: Name',
    ],
    [
      [{ label: 'Name', required: 'yes', maxLength: 5 }],
      'Custom field required must be true or false: Name',
    ],
  ]
  for (const [customFields, message] of invalid) {
    const slug = `invalid-fields-${++count}`
    await expect(
      productService.create({ name: 'X', slug, sku: slug, price: '1', customFields: customFields as any }),
    ).rejects.toThrow(message)
    expect(await productService.getBySlug(slug)).toBeUndefined()
  }

  const jersey = await createJersey()
  await expect(
    productService.update(jersey.id, {
      customFields: [{ label: 'Name', required: true, maxLength: -1 }],
    }),
  ).rejects.toThrow('Custom field maxLength must be a positive whole number: Name')
  expect((await productService.get(jersey.id))!.customFields).toEqual(jerseyFields)
})

test('should trim custom field labels', async () => {
  const product = await createJersey([{ label: '  Print name ', required: true, maxLength: 12 }])
  expect(product.customFields).toEqual([{ label: 'Print name', required: true, maxLength: 12 }])
})
