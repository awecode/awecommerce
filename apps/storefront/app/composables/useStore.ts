// Data many components need on one page is fetched once, under one key: a
// later caller waits for the request in flight (`defer`) instead of
// cancelling it and fetching again.

// The store's name, currency and locale, from the app's config
// (NUXT_PUBLIC_STORE_NAME, NUXT_PUBLIC_STORE_CURRENCY, NUXT_PUBLIC_STORE_LOCALE)
export const useStoreSettings = () => {
  const { store } = useRuntimeConfig().public
  return computed(() => store)
}

// Categories and brands with products the store shows
export const useCategories = () => useFetch('/api/store/categories', { key: 'categories', dedupe: 'defer' })
export const useBrands = () => useFetch('/api/store/brands', { key: 'brands', dedupe: 'defer' })

// Formats a price (a decimal string, as the API sends it) in the store's
// currency and locale. Empty for no price.
export const useMoney = () => {
  const settings = useStoreSettings()
  const format = computed(() =>
    new Intl.NumberFormat(settings.value.locale || 'en-US', { style: 'currency', currency: settings.value.currency || 'USD' }),
  )
  return (value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? '' : format.value.format(Number(value))
}

// The shop's menu: top-level categories with their subcategories. Only
// categories with products the store shows are listed.
export const useCategoryMenu = () => {
  const { data } = useCategories()
  return computed(() => {
    const categories = data.value ?? []
    return categories
      .filter((category) => !category.parentId)
      .map((category) => ({ ...category, children: categories.filter((child) => child.parentId === category.id) }))
  })
}
