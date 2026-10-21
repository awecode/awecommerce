<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Offers, newest first: views (Running, Scheduled, Ended, Inactive, All),
// type and search, and the page, all in the URL. A row opens the offer.
useSeoMeta({ title: 'Offers' })

const route = useRoute()
const router = useRouter()
const money = useMoney()
const store = useStoreSettings()

const param = (name: string) => (route.query[name] as string | undefined) || undefined
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes, page: undefined } })

const views = [
  { label: 'Running', value: 'running' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Ended', value: 'ended' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'All', value: 'all' },
]
const view = computed(() => param('view') ?? 'running')
const page = computed(() => Number(param('page')) || 1)

const search = ref(param('q') ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: value.trim() || undefined }), 250)
})

const pageSize = 50
const listQuery = computed(() => ({
  q: param('q'),
  type: param('type'),
  // Running and Scheduled are active offers only; Inactive is every turned-off offer
  state: ['running', 'scheduled', 'ended'].includes(view.value) ? view.value : undefined,
  active: view.value === 'running' || view.value === 'scheduled' ? 'true' : view.value === 'inactive' ? 'false' : undefined,
  page: page.value,
  size: pageSize,
}))
const { data, isLoading } = useQuery({
  key: () => ['offers', listQuery.value],
  query: () => apiGet('/api/admin/offers', { query: listQuery.value }),
})
type Offer = NonNullable<typeof data.value>['results'][number]

const date = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium' }))
const dates = (offer: Offer) => {
  const from = offer.startDate ? date.value.format(new Date(offer.startDate)) : null
  const to = offer.endDate ? date.value.format(new Date(offer.endDate)) : null
  return from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'Always'
}

const columns: TableColumn<Offer>[] = [
  { id: 'name', header: 'Offer' },
  { id: 'type', header: 'Type' },
  { id: 'benefit', header: 'Gives' },
  { id: 'dates', header: 'When' },
  { id: 'used', header: 'Used', meta: { class: { td: 'tabular-nums text-muted' } } },
  { id: 'status', header: 'Status' },
]
const typeItems = [{ label: 'Any type', value: 'any' }, ...Object.entries(offerTypeLabels).map(([value, label]) => ({ label, value }))]
</script>

<template>
  <UDashboardPanel id="offers">
    <template #header>
      <UDashboardNavbar title="Offers" icon="i-lucide-badge-percent">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span v-if="data" class="text-xs text-muted tabular-nums">{{ data.pagination.total }} offer{{ data.pagination.total === 1 ? '' : 's' }}</span>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search offers…" class="w-60" />
          <UButton icon="i-lucide-plus" label="New offer" to="/offers/new" />
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
            @update:model-value="(value) => setQuery({ view: value === 'running' ? undefined : String(value) })"
          />
        </template>
        <template #right>
          <USelect
            :model-value="param('type') ?? 'any'"
            :items="typeItems"
            aria-label="Type"
            class="w-36"
            @update:model-value="(value) => setQuery({ type: value === 'any' ? undefined : String(value) })"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="data?.results ?? []"
        :columns="columns"
        :loading="isLoading"
        empty="No offers match"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => navigateTo(`/offers/${row.original.id}`)"
      >
        <template #name-cell="{ row }">
          <p class="font-medium text-highlighted">{{ row.original.name }}</p>
          <p v-if="row.original.voucherCode" class="font-mono text-xs text-muted">{{ row.original.voucherCode }}</p>
        </template>
        <template #type-cell="{ row }">
          <UBadge :label="offerTypeLabels[row.original.type]" color="neutral" variant="outline" />
        </template>
        <template #benefit-cell="{ row }">
          {{ benefitText(row.original.benefit.type, row.original.benefit.value, money) }}
          <span class="text-muted">{{ conditionText(row.original.condition.type, row.original.condition.value, money) }}</span>
        </template>
        <template #dates-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ dates(row.original) }}</span>
        </template>
        <template #used-cell="{ row }">
          {{ row.original.usageCount ?? 0 }}<template v-if="row.original.overallLimit"> / {{ row.original.overallLimit }}</template>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.isActive ? 'success' : 'neutral'" variant="subtle" :label="row.original.isActive ? 'Active' : 'Inactive'" />
        </template>
      </UTable>

      <div v-if="(data?.pagination.total ?? 0) > pageSize" class="flex justify-end border-t border-default pt-3">
        <UPagination :page="page" :items-per-page="pageSize" :total="data!.pagination.total" @update:page="(value: number) => router.replace({ query: { ...route.query, page: String(value) } })" />
      </div>
    </template>
  </UDashboardPanel>
</template>
