// Categories, brands and product classes as choices for pickers and filters.
// 100 is the most the API gives at once.
export const useCatalogChoices = () => {
  const lookups = { query: { size: 100 } }
  const { data: categories } = useQuery({ key: ['categories', 'all'], query: () => apiGet('/api/admin/categories', lookups) })
  const { data: brands } = useQuery({ key: ['brands', 'all'], query: () => apiGet('/api/admin/brands', lookups) })
  const { data: classes } = useQuery({ key: ['product-classes', 'all'], query: () => apiGet('/api/admin/product-classes', lookups) })
  return {
    // Sorted by path ("Clothing › Shirts"), so subcategories follow their parent
    categories: computed(() =>
      (categories.value?.results ?? [])
        .map((c) => ({ label: c.parent ? `${c.parent.name} › ${c.name}` : c.name, value: c.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ),
    brands: computed(() => (brands.value?.results ?? []).map((b) => ({ label: b.name, value: b.id }))),
    classes: computed(() => (classes.value?.results ?? []).map((c) => ({ label: c.name, value: c.id }))),
  }
}
