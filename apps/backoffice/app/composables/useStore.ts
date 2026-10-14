// The store's name, currency and locale. Rarely changes, so cached for the session.
export const useStoreSettings = () =>
  useQuery({
    key: ['store-settings'],
    query: () => $fetch('/api/admin/settings/store'),
    staleTime: Infinity,
  })

// Formats a price (a decimal string, as the API sends it) in the store's
// currency and locale. Empty for no price.
export const useMoney = () => {
  const { data } = useStoreSettings()
  const format = computed(() => {
    const locale = data.value?.locale ?? 'en-US'
    const currency = data.value?.currency ?? 'USD'
    return new Intl.NumberFormat(locale, { style: 'currency', currency })
  })
  return (value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? '' : format.value.format(Number(value))
}
