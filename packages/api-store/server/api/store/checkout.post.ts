import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'

// Places the order for the buyer's cart. Prices, offers and shipping are read
// from the database; the buyer's confirmed total only has to match them.
export default defineServiceHandler(async (event) => {
  const { shippingAddressId, guestUser, paymentMethod, ...body } = await readValidatedBody(event, checkoutSchema.parse)
  const user = await getUser(event)
  if (!user && !guestUser) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'guestUser is required when not signed in' })
  }
  if (!user && shippingAddressId !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Sign in to use a saved address' })
  }
  let shippingAddress: Record<string, string> | undefined = body.shippingAddress
  if (user && shippingAddressId !== undefined) {
    const saved = await new ShippingAddressService(useDb()).get(user.id, shippingAddressId)
    if (!saved) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Shipping address not found: ${shippingAddressId}` })
    }
    // Copied onto the order, so later edits to the saved address do not change
    // it. Same fields as an address given inline.
    shippingAddress = Object.fromEntries(
      Object.keys(shippingAddressSchema.shape)
        .map((field) => [field, saved[field as keyof typeof saved]])
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  }
  const cart = await requireCart(event)
  const order = await new OrderService(useDb()).createFromCart(cart.id, {
    ...body,
    shippingAddress,
    // A signed-in buyer is the order's user; the guest details are not needed
    guestUser: user ? undefined : guestUser,
    metadata: { paymentMethod },
  })
  forgetCart(event)
  return order
})
