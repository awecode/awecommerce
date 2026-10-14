import { CartService } from '@awecommerce/service/apps/cart/services/cart'

export default defineServiceHandler(async (event) => {
  const code = getRouterParam(event, 'code', { decode: true })!
  const cart = await requireCart(event)
  await new CartService(useDb()).unapplyVoucherCode(cart.sessionId, code)
  return await cartSummary(cart)
})
