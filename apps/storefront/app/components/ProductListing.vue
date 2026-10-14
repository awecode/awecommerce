<script setup lang="ts">
// A page of products: a title, the filters (beside the grid on wide screens, in
// a drawer on small ones), sorting and pages. `base` is what the page shows
// (a category, a brand or a search); the rest is in the URL (`sort`, `page`,
// `size` and the filters).
const props = defineProps<{
  title: string
  description?: string | null
  base: { categories?: number; brands?: number; q?: string }
  // Off on a brand's own page
  brandFilter?: boolean
}>()

const route = useRoute()
const param = (name: string) => (route.query[name] as string | undefined) || undefined
const page = computed(() => Number(param('page')) || 1)
const size = computed(() => Number(param('size')) || 24)
const sort = computed(() => param('sort') ?? 'newest')

const query = computed(() => ({
  q: props.base.q,
  categories: props.base.categories,
  brands: props.base.brands ?? param('brands'),
  minPrice: param('minPrice'),
  maxPrice: param('maxPrice'),
  sortBy: sort.value === 'newest' ? undefined : sort.value,
  page: page.value,
  size: size.value,
}))
const { data, status } = await useFetch('/api/store/products', { query })

const sorts = [
  { label: 'Newest', value: 'newest' },
  { label: 'Price, low to high', value: 'priceAsc' },
  { label: 'Price, high to low', value: 'priceDesc' },
]
const setSort = (value: string) => navigateTo({ query: { ...route.query, sort: value === 'newest' ? undefined : value, page: undefined } })

const filtersOpen = ref(false)
const total = computed(() => data.value?.pagination.total ?? 0)
</script>

<template>
  <UContainer class="py-10 lg:py-14">
    <header class="max-w-2xl space-y-3">
      <h1 class="text-4xl font-medium tracking-tight sm:text-5xl">{{ title }}</h1>
      <p v-if="description" class="text-muted text-pretty">{{ description }}</p>
      <slot name="intro" />
    </header>

    <div class="mt-10 flex gap-12">
      <aside class="hidden w-52 shrink-0 lg:block" aria-label="Filters">
        <ListingFilters :brand-filter="brandFilter" />
      </aside>

      <div class="min-w-0 flex-1">
        <div class="mb-6 flex items-center gap-3">
          <UButton label="Filters" icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" class="lg:hidden" @click="filtersOpen = true" />
          <p class="text-sm text-muted">{{ total }} product{{ total === 1 ? '' : 's' }}</p>
          <USelect
            :model-value="sort"
            :items="sorts"
            aria-label="Sort by"
            class="ml-auto w-48"
            @update:model-value="(value) => setSort(String(value))"
          />
        </div>

        <ProductGrid v-if="data?.results.length" :products="data.results" :class="{ 'opacity-60': status === 'pending' }" />
        <div v-else class="py-20 text-center text-muted">No products match</div>

        <div v-if="total > size" class="mt-12 flex justify-center">
          <UPagination
            :page="page"
            :total="total"
            :items-per-page="size"
            :to="(p: number) => ({ query: { ...route.query, page: p === 1 ? undefined : p } })"
          />
        </div>
      </div>
    </div>

    <USlideover v-model:open="filtersOpen" title="Filters" side="left">
      <template #body>
        <ListingFilters :brand-filter="brandFilter" />
      </template>
    </USlideover>
  </UContainer>
</template>
