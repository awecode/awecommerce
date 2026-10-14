import { CartService } from '@awecommerce/service/apps/cart/services/cart'

// Changes a line's quantity, its answers, or both. New answers that match
// another line merge the two.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, cartLineParams.parse)
  const body = await readValidatedBody(event, updateCartLineSchema.parse)
  const cart = await requireCart(event)
  // Both or neither, so a rejected answer does not leave a changed quantity
  await useDb().transaction(async (tx) => {
    const cartService = new CartService(tx)
    if (body.quantity !== undefined) {
      await cartService.updateQuantity(cart.id, id, body.quantity)
    }
    if (body.customizations !== undefined) {
      await cartService.updateCustomizations(cart.id, id, body.customizations)
    }
  })
  return await cartSummary(cart)
})
