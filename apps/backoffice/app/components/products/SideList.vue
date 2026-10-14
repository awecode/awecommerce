<script setup lang="ts">
// The product list as a narrow panel beside a product, on wide screens (from
// 1536px, so the product keeps room for its variants table): a search and the
// newest products, with the open one marked.
defineProps<{ currentId: number | null }>()

const money = useMoney()
const search = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (q.value = value.trim()), 250)
})

const { data, isLoading } = useQuery({
  key: () => ['products', 'side', q.value],
  query: () => $fetch('/api/admin/products', { query: { q: q.value || undefined, size: 50 } }),
})
</script>

<template>
  <UDashboardPanel id="product-side-list" :default-size="16" :min-size="14" :max-size="28" resizable class="hidden 2xl:flex">
    <template #header>
      <UDashboardNavbar title="Products" :ui="{ title: 'text-sm' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <div class="border-b border-default p-2">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search products…" class="w-full" />
      </div>
    </template>

    <template #body>
      <div class="-m-4 sm:-m-6 divide-y divide-default overflow-y-auto">
        <NuxtLink
          v-for="product in data?.results ?? []"
          :key="product.id"
          :to="`/products/${product.id}`"
          class="flex items-center gap-2.5 px-3 py-2 hover:bg-elevated/60"
          :class="{ 'bg-elevated': product.id === currentId }"
          :aria-current="product.id === currentId ? 'page' : undefined"
        >
          <UAvatar :src="product.thumbnail ?? undefined" icon="i-lucide-image" size="xs" class="rounded" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ product.name }}</p>
            <p class="truncate text-xs text-muted">
              {{ product.status }}<template v-if="!product.isActive"> · Inactive</template> · {{ money(product.minPrice) }}
            </p>
          </div>
        </NuxtLink>
        <p v-if="!isLoading && !data?.results.length" class="p-4 text-sm text-muted">No products match</p>
      </div>
    </template>
  </UDashboardPanel>
</template>
