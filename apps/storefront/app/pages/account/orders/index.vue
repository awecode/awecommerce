<script setup lang="ts">
// The buyer's orders, newest first, a page at a time (`page` in the URL)
definePageMeta({ auth: true })
useSeoMeta({ title: 'Your orders', robots: 'noindex' })

const route = useRoute()
const size = 10
const page = computed(() => Number(route.query.page) || 1)
const { data: orders } = await useFetch('/api/store/orders', { key: 'orders', query: computed(() => ({ page: page.value, size })) })
</script>

<template>
  <AccountShell title="Your orders">
    <ul v-if="orders?.results.length" class="divide-y divide-default border-y border-default">
      <li v-for="order in orders.results" :key="order.id">
        <AccountOrderRow :order="order" />
      </li>
    </ul>
    <div v-else class="space-y-4 py-8">
      <p class="text-muted">You have not placed an order yet.</p>
      <UButton to="/" label="Start shopping" trailing-icon="i-lucide-arrow-right" />
    </div>
    <div v-if="(orders?.pagination.total ?? 0) > size" class="mt-10 flex justify-center">
      <UPagination :page="page" :total="orders!.pagination.total" :items-per-page="size" :to="(p: number) => ({ query: { page: p === 1 ? undefined : p } })" />
    </div>
  </AccountShell>
</template>
