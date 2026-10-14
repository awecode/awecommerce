import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Places the order for the buyer's cart. Prices, offers and shipping are read
// from the database; the buyer's confirmed total only has to match them.
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, checkoutSchema.parse)
  const cart = await requireCart(event)
  const order = await new OrderService(useDb()).createFromCart(cart.id, body)
  forgetCart(event)
  return order
})
