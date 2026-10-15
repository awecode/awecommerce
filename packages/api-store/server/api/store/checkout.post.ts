import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'
import { ValidationError } from '@awecommerce/service/core/errors'

// Places the order for the buyer's cart. Prices, offers and shipping are read
// from the database; the buyer's confirmed total only has to match them. A
// cart with nothing to ship (digital goods) takes no address, and pays later.
// Runs the placed fulfilment hooks, then emails the buyer.
export default defineServiceHandler(async (event) => {
  const { shippingAddressId, guestUser, paymentMethod, ...body } = await readValidatedBody(event, checkoutSchema.parse)
  const user = await getUser(event)
  if (!user && !guestUser) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'guestUser is required when not signed in' })
  }
  if (!user && shippingAddressId !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Sign in to use a saved address' })
  }
  const cart = await requireCart(event)
  const ships = await new CartService(useDb()).requiresShipping(cart.id)
  if (ships && body.shippingAddress === undefined && shippingAddressId === undefined) {
    throw new ValidationError('Pass shippingAddress or shippingAddressId: the cart has something to ship')
  }
  const payment = paymentMethod ?? (ships ? 'pay_on_delivery' : 'pay_later')
  if (payment !== (ships ? 'pay_on_delivery' : 'pay_later')) {
    throw new ValidationError(ships ? 'Pay on delivery is the only payment for a cart that is shipped' : 'Nothing in the cart is shipped, so it cannot be paid on delivery')
  }
  // Nothing to ship, nowhere to ship it
  let shippingAddress: Record<string, string> | undefined = ships ? body.shippingAddress : undefined
  if (ships && user && shippingAddressId !== undefined) {
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
  const order = await new OrderService(useDb()).createFromCart(cart.id, {
    ...body,
    shippingAddress,
    // A signed-in buyer is the order's user; the guest details are not needed
    guestUser: user ? undefined : guestUser,
    metadata: { paymentMethod: payment },
  })
  forgetCart(event)
  await runFulfillment(event, 'placed', order.id)
  // Logged, not thrown, when it fails: the order is placed either way
  await sendOrderEmail(event, 'placed', order, { requestOrigin: true })
  return order
})
