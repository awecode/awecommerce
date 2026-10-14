// The store's name, currency and locale, fetched once per page load and
// shared by every caller
export const useStoreSettings = () => useFetch('/api/store/settings', { key: 'store-settings' })

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
  const { data } = useFetch('/api/store/categories', { key: 'categories' })
  return computed(() => {
    const categories = data.value ?? []
    return categories
      .filter((category) => !category.parentId)
      .map((category) => ({ ...category, children: categories.filter((child) => child.parentId === category.id) }))
  })
}
