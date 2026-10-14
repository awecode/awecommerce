// The buyer's cart with offers, tax and totals. Before the first add there is
// no cart: 204 with no body.
export default defineServiceHandler(async (event) => {
  const cart = await findCart(event)
  return cart ? await cartSummary(cart) : null
})
