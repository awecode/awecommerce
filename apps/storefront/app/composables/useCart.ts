// The buyer's cart summary (null before the first add), shared by the header,
// the drawer and the cart page, with the actions that change it. Every action
// stores the summary the API answers with; failures throw, with the API's
// message in `cartErrorMessage(error)`.
export const useCart = () => {
  // One request per page, however many components ask (see useStoreSettings)
  const request = useFetch('/api/store/cart', { key: 'cart', dedupe: 'defer' })
  const { data, refresh } = request
  const drawerOpen = useState('cart-drawer-open', () => false)
  const count = computed(() => (data.value?.lines ?? []).reduce((total, line) => total + line.quantity, 0))

  // The routes with an id are only known at run time
  const api = $fetch as <T = typeof data.value>(url: string, options?: Record<string, unknown>) => Promise<T>
  const store = (summary: typeof data.value) => (data.value = summary)

  return {
    cart: data,
    // Resolves once the cart is loaded, for a page that needs it first
    loaded: request.then(() => {}),
    count,
    refresh,
    drawerOpen,
    add: async (variantId: number, quantity: number, customizations: Record<string, string> = {}) =>
      store(await api('/api/store/cart/lines', { method: 'POST', body: { variantId, quantity, customizations } })),
    setQuantity: async (lineId: number, quantity: number) =>
      store(await api(`/api/store/cart/lines/${lineId}`, { method: 'PATCH', body: { quantity } })),
    remove: async (lineId: number) => store(await api(`/api/store/cart/lines/${lineId}`, { method: 'DELETE' })),
    applyVoucher: async (code: string) => store(await api('/api/store/cart/vouchers', { method: 'POST', body: { code } })),
    removeVoucher: async (code: string) =>
      store(await api(`/api/store/cart/vouchers/${encodeURIComponent(code)}`, { method: 'DELETE' })),
  }
}

export type CartSummary = NonNullable<ReturnType<typeof useCart>['cart']['value']>
export type CartLine = CartSummary['lines'][number]

// The API's message for a failed cart request, for showing to the buyer
export const cartErrorMessage = (error: unknown) =>
  (error as { data?: { message?: string } })?.data?.message ?? 'Something went wrong. Please try again.'

// What stops a line from being checked out, if anything
export const lineProblem = (line: CartLine) => {
  if (!line.isAvailable) return 'No longer for sale. Remove it to check out.'
  if (!line.isInStock) {
    return line.stockLeft ? `Only ${line.stockLeft} left. Lower the quantity to check out.` : 'Sold out. Remove it to check out.'
  }
  if (line.customizationsError) return `${line.customizationsError}. Remove it and add it again.`
  return null
}
