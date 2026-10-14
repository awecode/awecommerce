import { CartService } from '@awecommerce/service/apps/cart/services/cart'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, cartLineParams.parse)
  const cart = await requireCart(event)
  await new CartService(useDb()).removeFromCart(cart.id, id)
  return await cartSummary(cart)
})
