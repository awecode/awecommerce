import { CartService } from '@awecommerce/service/apps/cart/services/cart'

// Adds a variant, creating the cart on the first add
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, addCartLineSchema.parse)
  const cart = await findOrCreateCart(event)
  await new CartService(useDb()).addToCart(
    cart.id,
    body.variantId,
    body.quantity,
    body.customizations,
  )
  return await cartSummary(cart)
})
