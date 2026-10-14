<script setup lang="ts">
// A first products screen to prove the shell and data flow; the full list
// (filters, views, bulk actions, inline edits) replaces it next.
const money = useMoney()
const { data, isLoading } = useQuery({
  key: ['products', 'first-page'],
  query: () => $fetch('/api/admin/products', { query: { size: 50 } }),
})

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
  { id: 'price', header: 'Price' },
  { accessorKey: 'totalStock', header: 'Stock' },
]
</script>

<template>
  <UDashboardPanel id="products">
    <template #header>
      <UDashboardNavbar title="Products">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="data?.results ?? []" :columns="columns" :loading="isLoading" class="shrink-0">
        <template #name-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.name }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.status === 'Published' ? 'success' : 'neutral'" variant="subtle">
            {{ row.original.status }}
          </UBadge>
        </template>
        <template #price-cell="{ row }">
          {{ money(row.original.minPrice) }}<template v-if="row.original.maxPrice !== row.original.minPrice"> – {{ money(row.original.maxPrice) }}</template>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
