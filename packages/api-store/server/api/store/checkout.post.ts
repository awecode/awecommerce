import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'
import { ValidationError } from '@awecommerce/service/core/errors'

// Places the order for the buyer's cart. Prices, offers and shipping are read
// from the database; the buyer's confirmed total only has to match them. A
// cart with nothing to ship (digital goods) takes no address. Runs the placed
// fulfilment hooks, then emails the buyer (for an online payment, once it is
// paid instead). With an online payment method, it
// then starts the payment: `payment.redirectUrl` is where to send the buyer
// (null when the payment could not be started: the order page offers Pay now).
// The order is placed either way.
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
  const methods = paymentMethodsFor({ requiresShipping: ships, currency: await storeCurrency() })
  if (!methods.length) {
    throw new ValidationError('Payments are not set up yet')
  }
  // The only one there is, when none is chosen
  const method = paymentMethod ? methods.find((m) => m.id === paymentMethod) : methods.length === 1 ? methods[0] : undefined
  if (!method) {
    throw new ValidationError(paymentMethod ? `${paymentMethod} cannot pay for this cart` : 'Choose a payment method')
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
  const orders = new OrderService(useDb())
  const order = await orders.createFromCart(cart.id, {
    ...body,
    shippingAddress,
    // A signed-in buyer is the order's user; the guest details are not needed
    guestUser: user ? undefined : guestUser,
    paymentMethod: method.id,
  })
  forgetCart(event)
  await runFulfillment(event, 'placed', order.id)
  // Paid later: the order is placed now. Paid online: confirmed once paid
  // (see settlePayment). Logged, not thrown, when it fails: the order is
  // placed either way.
  if (!method.online) await sendOrderEmail(event, 'placed', order, { requestOrigin: true })
  let redirectUrl: string | null = null
  if (method.online) {
    try {
      redirectUrl = (await startPayment(event, (await orders.get(order.id))!, paymentProvider(method.id)!)).redirectUrl
    } catch (error) {
      console.error(`Order ${order.id}: the payment could not be started`, error)
    }
  }
  return { ...order, payment: { redirectUrl } }
})
