// The buyer's cart with offers, tax and totals, including shipping when a
// method is given. Before the first add there is no cart: 204 with no body.
export default defineServiceHandler(async (event) => {
  const { shippingMethodId } = await getValidatedQuery(event, cartQuery.parse)
  const cart = await findCart(event)
  return cart ? await cartSummary(cart, shippingMethodId) : null
})
