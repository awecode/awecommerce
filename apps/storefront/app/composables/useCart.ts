// The buyer's cart summary (null before the first add), shared by the header
// and the cart pages. Call `refresh` after changing the cart.
export const useCart = () => {
  const { data, refresh } = useFetch('/api/store/cart', { key: 'cart' })
  const count = computed(() => (data.value?.lines ?? []).reduce((total, line) => total + line.quantity, 0))
  return { cart: data, count, refresh }
}
