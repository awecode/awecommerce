// Data many components need on one page is fetched once, under one key: a
// later caller waits for the request in flight (`defer`) instead of
// cancelling it and fetching again.

// The store's name, currency and locale
export const useStoreSettings = () => useFetch('/api/store/settings', { key: 'store-settings', dedupe: 'defer' })

// Categories and brands with products the store shows
export const useCategories = () => useFetch('/api/store/categories', { key: 'categories', dedupe: 'defer' })
export const useBrands = () => useFetch('/api/store/brands', { key: 'brands', dedupe: 'defer' })

// Formats a price (a decimal string, as the API sends it) in the store's
// currency and locale. Empty for no price.
export const useMoney = () => {
  const { data } = useStoreSettings()
  const format = computed(() =>
    new Intl.NumberFormat(data.value?.locale ?? 'en-US', { style: 'currency', currency: data.value?.currency ?? 'USD' }),
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
