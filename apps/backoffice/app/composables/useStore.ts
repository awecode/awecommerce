// The store's name, currency and locale, from the app's config
// (NUXT_PUBLIC_STORE_NAME, NUXT_PUBLIC_STORE_CURRENCY, NUXT_PUBLIC_STORE_LOCALE)
export const useStoreSettings = () => {
  const { store } = useRuntimeConfig().public
  return computed(() => store)
}

// Formats a price (a decimal string, as the API sends it) in the store's
// currency and locale. Empty for no price.
export const useMoney = () => {
  const settings = useStoreSettings()
  const format = computed(() => {
    const locale = settings.value.locale || 'en-US'
    const currency = settings.value.currency || 'USD'
    return new Intl.NumberFormat(locale, { style: 'currency', currency })
  })
  return (value: string | number | null | undefined) =>
    value === null || value === undefined || value === '' ? '' : format.value.format(Number(value))
}
