import { CartService } from '@awecommerce/service/apps/cart/services/cart'

// The payment methods checkout offers for the buyer's cart (whether it has
// something to ship decides some), in the store's order: `id` (to send as the
// checkout's paymentMethod), `label`, `description`, and `online` (the buyer
// is sent to pay at a gateway). Empty when none is set up.
export default defineServiceHandler(async (event) => {
  const cart = await findCart(event)
  const requiresShipping = cart ? await new CartService(useDb()).requiresShipping(cart.id) : true
  return paymentMethodsFor({ requiresShipping, currency: storeCurrency() })
})
