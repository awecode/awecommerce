<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Orders, newest first: views (To do, All, Completed, Cancelled), search
// (order number, customer email or name), status, payment and day filters,
// and the page, all in the URL
useSeoMeta({ title: 'Orders' })

const route = useRoute()
const router = useRouter()
const money = useMoney()
const { data: store } = useStoreSettings()

const param = (name: string) => (route.query[name] as string | undefined) || undefined
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes, page: undefined } })

const views = [
  { label: 'To do', value: 'todo' },
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]
const viewTabs: Record<string, string | undefined> = { todo: 'Active', all: undefined, completed: 'Completed', cancelled: 'Cancelled' }
const view = computed(() => param('view') ?? 'todo')
const page = computed(() => Number(param('page')) || 1)

const search = ref(param('q') ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: value.trim() || undefined }), 250)
})

const pageSize = 50
const listQuery = computed(() => ({
  tab: viewTabs[view.value],
  q: param('q'),
  status: param('status'),
  paymentStatus: param('payment'),
  createdAt: param('day'),
  page: page.value,
  size: pageSize,
}))
const { data, isLoading } = useQuery({
  key: () => ['orders', listQuery.value],
  query: () => apiGet('/api/admin/orders', { query: listQuery.value }),
})
type Order = NonNullable<typeof data.value>['results'][number]

const dateTime = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium', timeStyle: 'short' }))

const columns: TableColumn<Order>[] = [
  { id: 'number', header: 'Order', meta: { class: { td: 'w-20' } } },
  { id: 'date', header: 'Placed' },
  { id: 'customer', header: 'Customer' },
  { id: 'items', header: 'Items', meta: { class: { td: 'tabular-nums text-muted' } } },
  { id: 'total', header: 'Total', meta: { class: { td: 'tabular-nums' } } },
  { id: 'status', header: 'Status' },
  { id: 'payment', header: 'Payment' },
]
const statusItems = [{ label: 'Any status', value: 'any' }, ...orderStatuses.map((s) => ({ label: s, value: s }))]
const paymentItems = [{ label: 'Any payment', value: 'any' }, ...['Pending', 'Paid', 'Refunded'].map((s) => ({ label: s, value: s }))]
</script>

<template>
  <UDashboardPanel id="orders">
    <template #header>
      <UDashboardNavbar title="Orders" icon="i-lucide-receipt">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span v-if="data" class="text-xs text-muted tabular-nums">{{ data.pagination.total }} order{{ data.pagination.total === 1 ? '' : 's' }}</span>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search orders…" class="w-60" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UTabs
            :items="views"
            :model-value="view"
            :content="false"
            variant="link"
            class="-mb-px"
            @update:model-value="(value) => setQuery({ view: value === 'todo' ? undefined : String(value) })"
          />
        </template>
        <template #right>
          <USelect
            :model-value="param('status') ?? 'any'"
            :items="statusItems"
            aria-label="Status"
            class="w-36"
            @update:model-value="(value) => setQuery({ status: value === 'any' ? undefined : String(value) })"
          />
          <USelect
            :model-value="param('payment') ?? 'any'"
            :items="paymentItems"
            aria-label="Payment"
            class="w-36"
            @update:model-value="(value) => setQuery({ payment: value === 'any' ? undefined : String(value) })"
          />
          <UInput
            type="date"
            :model-value="param('day') ?? ''"
            aria-label="Placed on"
            class="w-40"
            @update:model-value="(value) => setQuery({ day: String(value) || undefined })"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="data?.results ?? []"
        :columns="columns"
        :loading="isLoading"
        empty="No orders match"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => navigateTo(`/orders/${row.original.id}`)"
      >
        <template #number-cell="{ row }">
          <span class="font-medium text-highlighted tabular-nums">#{{ row.original.id }}</span>
        </template>
        <template #date-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ dateTime.format(new Date(row.original.createdAt)) }}</span>
        </template>
        <template #customer-cell="{ row }">
          <div v-if="row.original.customer" class="flex items-center gap-2">
            <div class="min-w-0">
              <p class="truncate text-highlighted">{{ row.original.customer.name || row.original.customer.email }}</p>
              <p v-if="row.original.customer.name" class="truncate text-xs text-muted">{{ row.original.customer.email }}</p>
            </div>
            <UBadge v-if="row.original.customer.guest" label="Guest" color="neutral" variant="outline" />
          </div>
          <span v-else class="text-muted">–</span>
        </template>
        <template #items-cell="{ row }">{{ row.original.items }}</template>
        <template #total-cell="{ row }">{{ money(row.original.total) }}</template>
        <template #status-cell="{ row }">
          <UBadge :label="row.original.status" :color="statusColor[row.original.status as OrderStatus]" variant="subtle" />
        </template>
        <template #payment-cell="{ row }">
          <UBadge :label="row.original.paymentStatus" :color="paymentColor[row.original.paymentStatus]" variant="outline" />
        </template>
      </UTable>

      <div v-if="(data?.pagination.total ?? 0) > pageSize" class="flex justify-end border-t border-default pt-3">
        <UPagination :page="page" :items-per-page="pageSize" :total="data!.pagination.total" @update:page="(value: number) => router.replace({ query: { ...route.query, page: String(value) } })" />
      </div>
    </template>
  </UDashboardPanel>
</template>
