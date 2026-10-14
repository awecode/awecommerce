<script setup lang="ts">
// Brand and price filters for a product listing, kept in the URL (`brands`
// as ids `1,2`, `minPrice`, `maxPrice`). Each change goes back to page 1.
defineProps<{ brandFilter?: boolean }>()

const route = useRoute()
const { data: brands } = await useFetch('/api/store/brands', { key: 'brands' })

const param = (name: string) => (route.query[name] as string | undefined) || undefined
const setQuery = (changes: Record<string, string | undefined>) =>
  navigateTo({ query: { ...route.query, ...changes, page: undefined } })

const selectedBrands = computed(() => (param('brands') ?? '').split(',').filter(Boolean).map(Number))
const toggleBrand = (id: number, on: boolean) => {
  const next = on ? [...selectedBrands.value, id] : selectedBrands.value.filter((b) => b !== id)
  setQuery({ brands: next.length ? next.join(',') : undefined })
}

const minPrice = ref(param('minPrice') ?? '')
const maxPrice = ref(param('maxPrice') ?? '')
watch(() => route.query, () => {
  minPrice.value = param('minPrice') ?? ''
  maxPrice.value = param('maxPrice') ?? ''
})
const applyPrice = () => setQuery({ minPrice: minPrice.value.trim() || undefined, maxPrice: maxPrice.value.trim() || undefined })

const filtered = computed(() => Boolean(param('brands') || param('minPrice') || param('maxPrice')))
const clear = () => setQuery({ brands: undefined, minPrice: undefined, maxPrice: undefined })
</script>

<template>
  <div class="space-y-8">
    <fieldset v-if="brandFilter && brands?.length" class="space-y-3">
      <legend class="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Brand</legend>
      <UCheckbox
        v-for="brand in brands"
        :key="brand.id"
        :model-value="selectedBrands.includes(brand.id)"
        :label="brand.name"
        @update:model-value="(on) => toggleBrand(brand.id, Boolean(on))"
      />
    </fieldset>
    <fieldset>
      <legend class="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Price</legend>
      <form class="flex items-center gap-2" @submit.prevent="applyPrice">
        <UInput v-model="minPrice" inputmode="decimal" placeholder="Min" aria-label="Lowest price" class="w-24" @blur="applyPrice" />
        <span class="text-muted">–</span>
        <UInput v-model="maxPrice" inputmode="decimal" placeholder="Max" aria-label="Highest price" class="w-24" @blur="applyPrice" />
        <button type="submit" class="sr-only">Apply price</button>
      </form>
    </fieldset>
    <UButton v-if="filtered" label="Clear filters" color="neutral" variant="link" class="px-0" @click="clear" />
  </div>
</template>
