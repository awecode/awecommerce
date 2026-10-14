import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const { code } = await readValidatedBody(event, applyVoucherSchema.parse)
  const cart = await requireCart(event)
  // With the cart's offers and vouchers applied, so the voucher only fills
  // what they left
  const content = await new CartService(useDb()).getCartContentForSession(cart.sessionId, true)
  await new OfferService(useDb()).applyVoucherCode(content, undefined, code, cart.userId ?? undefined)
  return await cartSummary(cart)
})
