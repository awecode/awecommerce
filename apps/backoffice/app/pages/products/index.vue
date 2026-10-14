<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

useSeoMeta({ title: 'Products' })

// Paths with an id are only known at run time, so the typed routes do not apply
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const queryCache = useQueryCache()
const money = useMoney()
const { data: store } = useStoreSettings()

// ---- view, filters, sort and page, all in the URL
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes } })
const param = (name: string) => (route.query[name] as string | undefined) || undefined
const filterChange = (changes: Record<string, string | undefined>) => setQuery({ ...changes, page: undefined })

const views = [
  { label: 'All', value: 'all' },
  { label: 'Drafts', value: 'drafts' },
  { label: 'Published', value: 'published' },
  { label: 'Inactive', value: 'inactive' },
]
const viewFilters: Record<string, Record<string, string>> = {
  drafts: { status: 'Draft' },
  published: { status: 'Published' },
  inactive: { active: 'false' },
}
const view = computed(() => param('view') ?? 'all')
const sort = computed(() => param('sort') ?? 'newest')
const page = computed(() => Number(param('page')) || 1)

const search = ref(param('q') ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => filterChange({ q: value || undefined }), 250)
})

const pageSize = 50
const listQuery = computed(() => ({
  ...viewFilters[view.value],
  q: param('q'),
  categories: param('category'),
  brands: param('brand'),
  productClass: param('class'),
  sortBy: sort.value,
  page: page.value,
  size: pageSize,
}))
const { data, isLoading } = useQuery({
  key: () => ['products', listQuery.value],
  query: () => $fetch('/api/admin/products', { query: listQuery.value }),
})
type Product = NonNullable<typeof data.value>['results'][number]
const refresh = () => queryCache.invalidateQueries({ key: ['products'] })

// Choices for the filters, with ids as text like the URL's
const choices = useCatalogChoices()
const asText = (items: { label: string; value: number }[]) => items.map((item) => ({ ...item, value: String(item.value) }))
const filters = computed(() => [
  { name: 'category', placeholder: 'Category', items: asText(choices.categories.value) },
  { name: 'brand', placeholder: 'Brand', items: asText(choices.brands.value) },
  { name: 'class', placeholder: 'Class', items: asText(choices.classes.value) },
])

// Clicking a sortable header sorts by it, and clicking again reverses
const toggleSort = (ascending: string, descending: string) => {
  const next = sort.value === ascending ? descending : ascending
  setQuery({ sort: next === 'newest' ? undefined : next, page: undefined })
}
const sortIcon = (ascending: string, descending: string) =>
  sort.value === ascending ? 'i-lucide-arrow-up' : sort.value === descending ? 'i-lucide-arrow-down' : 'i-lucide-arrow-up-down'

// ---- columns, the optional ones chosen in a menu and remembered in the browser
const optionalColumns = [
  { id: 'status', label: 'Status' },
  { id: 'price', label: 'Price' },
  { id: 'sale', label: 'Sale price', hidden: true },
  { id: 'stock', label: 'Stock' },
  { id: 'variants', label: 'Variants' },
  { id: 'sku', label: 'SKU', hidden: true },
  { id: 'category', label: 'Category' },
  { id: 'brand', label: 'Brand' },
  { id: 'productClass', label: 'Class', hidden: true },
  { id: 'createdAt', label: 'Created' },
]
const columnsKey = 'backoffice:products:columns'
const columnVisibility = ref<Record<string, boolean>>({
  ...Object.fromEntries(optionalColumns.map((column) => [column.id, !column.hidden])),
  ...JSON.parse(localStorage.getItem(columnsKey) ?? '{}'),
})
watch(columnVisibility, (value) => localStorage.setItem(columnsKey, JSON.stringify(value)), { deep: true })
const columnMenu = computed<DropdownMenuItem[]>(() =>
  optionalColumns.map((column) => ({
    label: column.label,
    type: 'checkbox' as const,
    checked: columnVisibility.value[column.id] !== false,
    onUpdateChecked: (checked: boolean) => (columnVisibility.value = { ...columnVisibility.value, [column.id]: checked }),
    // Keeps the menu open, to change several
    onSelect: (event: Event) => event.preventDefault(),
  })),
)

const columns: TableColumn<Product>[] = [
  { id: 'select', meta: { class: { th: 'w-8', td: 'w-8' } } },
  { id: 'name', header: 'Name' },
  ...optionalColumns.map(({ id, label }) => ({ id, header: label })),
  { id: 'actions', meta: { class: { td: 'text-right w-10' } } },
]

const dateFormat = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium' }))
const priceRange = (product: Product) =>
  product.minPrice === product.maxPrice ? money(product.minPrice) : `${money(product.minPrice)} – ${money(product.maxPrice)}`

// ---- price and stock, edited in place for products with one variant
const saveVariant = (product: Product, field: 'price' | 'discountedPrice' | 'stockQuantity') => async (value: string | null) => {
  try {
    await api(`/api/admin/variants/${product.singleVariant!.id}`, {
      method: 'PATCH',
      body: { [field]: field === 'stockQuantity' ? Number(value) : value },
    })
  } catch (error) {
    toast.add({ title: 'Could not save', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    throw error
  }
  await refresh()
}

// ---- selection and bulk changes
const rowSelection = ref<Record<string, boolean>>({})
const selectedIds = computed(() => Object.keys(rowSelection.value).filter((id) => rowSelection.value[id]).map(Number))
watch(listQuery, () => (rowSelection.value = {}))

const plural = (count: number) => `${count} product${count === 1 ? '' : 's'}`
const bulkActions = [
  { label: 'Publish', done: 'Published', changes: { status: 'Published' } },
  { label: 'Unpublish', done: 'Unpublished', changes: { status: 'Draft' } },
  { label: 'Activate', done: 'Activated', changes: { isActive: true } },
  { label: 'Deactivate', done: 'Deactivated', changes: { isActive: false } },
]
const change = async (ids: number[], action: (typeof bulkActions)[number]) => {
  try {
    await $fetch('/api/admin/products/bulk', { method: 'POST', body: { ids, changes: action.changes } })
    toast.add({ title: `${action.done} ${plural(ids.length)}`, color: 'success', icon: 'i-lucide-check' })
    rowSelection.value = {}
  } catch (error) {
    toast.add({ title: 'Could not change them', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refresh()
}
const bulkAction = (label: string) => bulkActions.find((action) => action.label === label)!

const remove = async (product: Product) => {
  if (!(await confirm({ title: `Delete ${product.name}?`, description: 'This deletes the product and its variants for good.', confirmLabel: 'Delete', color: 'error' }))) {
    return
  }
  try {
    await api(`/api/admin/products/${product.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${product.name}`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    if (isInUse(error) && product.isActive) {
      const deactivate = await confirm({
        title: `${product.name} is in use`,
        description: 'It cannot be deleted while orders or carts refer to it. Deactivate it instead, to hide it from the store?',
        confirmLabel: 'Deactivate',
      })
      if (deactivate) return await change([product.id], bulkAction('Deactivate'))
    } else {
      toast.add({ title: 'Could not delete', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    }
  }
  await refresh()
}

const rowMenu = (product: Product): DropdownMenuItem[][] => [
  [{ label: 'Open', icon: 'i-lucide-arrow-right', onSelect: () => openProduct(product) }],
  [
    product.status === 'Published'
      ? { label: 'Unpublish', icon: 'i-lucide-file-pen', onSelect: () => change([product.id], bulkAction('Unpublish')) }
      : { label: 'Publish', icon: 'i-lucide-send', onSelect: () => change([product.id], bulkAction('Publish')) },
    product.isActive
      ? { label: 'Deactivate', icon: 'i-lucide-eye-off', onSelect: () => change([product.id], bulkAction('Deactivate')) }
      : { label: 'Activate', icon: 'i-lucide-eye', onSelect: () => change([product.id], bulkAction('Activate')) },
  ],
  [{ label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(product) }],
]

// ---- keyboard: / searches, arrows move through the rows, Enter opens one
const openProduct = (product: Product) => navigateTo(`/products/${product.id}`)
const highlighted = ref(-1)
watch(data, () => (highlighted.value = -1))
const move = async (step: number) => {
  const rows = data.value?.results ?? []
  if (!rows.length) return
  highlighted.value = Math.min(Math.max(highlighted.value + step, 0), rows.length - 1)
  await nextTick()
  document.querySelector('.row-highlighted')?.scrollIntoView({ block: 'nearest' })
}
const searchInput = useTemplateRef('searchInput')
defineShortcuts({ '/': () => searchInput.value?.inputRef?.focus() })
// Not through defineShortcuts, which would also take Enter and the arrows from
// focused buttons, tabs and menus: these only act when nothing else has focus
// (or a row does)
const onListKey = (event: KeyboardEvent) => {
  const focused = document.activeElement
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || (focused && focused !== document.body && focused.tagName !== 'TR')) {
    return
  }
  const product = data.value?.results[highlighted.value]
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Enter' && product) {
    event.preventDefault()
    openProduct(product)
  }
}
onMounted(() => document.addEventListener('keydown', onListKey))
onUnmounted(() => document.removeEventListener('keydown', onListKey))
const tableMeta = { class: { tr: (row: { index: number }) => (row.index === highlighted.value ? 'row-highlighted bg-elevated' : '') } }
</script>

<template>
  <UDashboardPanel id="products">
    <template #header>
      <UDashboardNavbar title="Products" icon="i-lucide-package">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span v-if="data" class="text-xs text-muted tabular-nums">{{ plural(data.pagination.total) }}</span>
          <UButton icon="i-lucide-plus" label="New product" to="/products/new" />
          <UInput ref="searchInput" v-model="search" icon="i-lucide-search" placeholder="Search…" class="w-60">
            <template #trailing>
              <UKbd value="/" />
            </template>
          </UInput>
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
            @update:model-value="(value) => filterChange({ view: value === 'all' ? undefined : String(value) })"
          />
        </template>
        <template #right>
          <USelectMenu
            v-for="filter in filters"
            :key="filter.name"
            :model-value="param(filter.name)"
            :items="filter.items"
            value-key="value"
            :placeholder="filter.placeholder"
            :search-input="{ placeholder: 'Filter…' }"
            clear
            class="w-32"
            :ui="{ content: 'min-w-56' }"
            @update:model-value="(value: string | null | undefined) => filterChange({ [filter.name]: value || undefined })"
          />
          <UDropdownMenu :items="columnMenu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-columns-3" color="neutral" variant="outline" label="Columns" />
          </UDropdownMenu>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        v-model:column-visibility="columnVisibility"
        v-model:row-selection="rowSelection"
        :data="data?.results ?? []"
        :columns="columns"
        :get-row-id="(row: Product) => String(row.id)"
        :meta="tableMeta"
        :loading="isLoading"
        empty="No products match"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => openProduct(row.original)"
      >
        <template #select-header="{ table }">
          <UCheckbox
            :model-value="table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected()"
            aria-label="Select all"
            @update:model-value="(value) => table.toggleAllPageRowsSelected(!!value)"
          />
        </template>
        <template #select-cell="{ row }">
          <div @click.stop>
            <UCheckbox
              :model-value="row.getIsSelected()"
              :aria-label="`Select ${row.original.name}`"
              @update:model-value="(value) => row.toggleSelected(!!value)"
            />
          </div>
        </template>

        <template #name-header>
          <UButton label="Name" color="neutral" variant="link" class="px-0 text-xs font-medium text-muted" :trailing-icon="sortIcon('nameAsc', 'nameDesc')" @click="toggleSort('nameAsc', 'nameDesc')" />
        </template>
        <template #name-cell="{ row }">
          <div class="flex min-w-0 items-center gap-2.5">
            <UAvatar :src="row.original.thumbnail ?? undefined" icon="i-lucide-image" size="xs" class="rounded" :alt="row.original.name" />
            <span data-product-name class="truncate font-medium text-highlighted">{{ row.original.name }}</span>
            <UIcon v-if="row.original.isFeatured" name="i-lucide-star" class="size-3.5 shrink-0 text-warning" />
          </div>
        </template>

        <template #status-cell="{ row }">
          <div class="flex gap-1">
            <UBadge :color="row.original.status === 'Published' ? 'success' : 'neutral'" variant="subtle">
              {{ row.original.status }}
            </UBadge>
            <UBadge v-if="!row.original.isActive" color="warning" variant="subtle">Inactive</UBadge>
          </div>
        </template>

        <template #price-header>
          <UButton label="Price" color="neutral" variant="link" class="px-0 text-xs font-medium text-muted" :trailing-icon="sortIcon('priceAsc', 'priceDesc')" @click="toggleSort('priceAsc', 'priceDesc')" />
        </template>
        <template #price-cell="{ row }">
          <ProductsInlineEdit
            v-if="row.original.singleVariant"
            :value="row.original.singleVariant.price"
            :display="money(row.original.singleVariant.price)"
            :label="`Price of ${row.original.name}`"
            kind="money"
            :save="saveVariant(row.original, 'price')"
          />
          <span v-else class="tabular-nums text-muted">{{ priceRange(row.original) }}</span>
        </template>

        <template #sale-cell="{ row }">
          <ProductsInlineEdit
            v-if="row.original.singleVariant"
            :value="row.original.singleVariant.discountedPrice"
            :display="money(row.original.singleVariant.discountedPrice)"
            :label="`Sale price of ${row.original.name}`"
            kind="money"
            nullable
            :save="saveVariant(row.original, 'discountedPrice')"
          />
        </template>

        <template #stock-cell="{ row }">
          <span v-if="row.original.productClass?.trackStock === false" class="text-dimmed">Not tracked</span>
          <ProductsInlineEdit
            v-else-if="row.original.singleVariant"
            :value="row.original.singleVariant.stockQuantity ?? 0"
            :display="String(row.original.singleVariant.stockQuantity ?? 0)"
            :label="`Stock of ${row.original.name}`"
            kind="integer"
            :save="saveVariant(row.original, 'stockQuantity')"
          />
          <span v-else class="tabular-nums text-muted">{{ row.original.totalStock }}</span>
        </template>

        <template #variants-cell="{ row }">
          <span class="tabular-nums text-muted">{{ row.original.variantCount }}</span>
        </template>
        <template #sku-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.singleVariant?.sku }}</span>
        </template>
        <template #category-cell="{ row }">
          <span class="text-muted">{{ row.original.category?.name }}</span>
        </template>
        <template #brand-cell="{ row }">
          <span class="text-muted">{{ row.original.brand?.name }}</span>
        </template>
        <template #productClass-cell="{ row }">
          <span class="text-muted">{{ row.original.productClass?.name }}</span>
        </template>

        <template #createdAt-header>
          <UButton label="Created" color="neutral" variant="link" class="px-0 text-xs font-medium text-muted" :trailing-icon="sortIcon('oldest', 'newest')" @click="toggleSort('oldest', 'newest')" />
        </template>
        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ row.original.createdAt ? dateFormat.format(new Date(row.original.createdAt)) : '' }}</span>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu :items="rowMenu(row.original)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="`Actions for ${row.original.name}`" @click.stop />
          </UDropdownMenu>
        </template>
      </UTable>

      <div v-if="(data?.pagination.total ?? 0) > pageSize" class="flex justify-end border-t border-default pt-3">
        <UPagination :page="page" :items-per-page="pageSize" :total="data!.pagination.total" @update:page="(value: number) => setQuery({ page: String(value) })" />
      </div>

      <!-- Bulk changes for the ticked rows -->
      <div
        v-if="selectedIds.length"
        class="fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-default bg-default p-1.5 pl-3 shadow-lg"
      >
        <span class="mr-2 text-sm font-medium tabular-nums">{{ selectedIds.length }} selected</span>
        <UButton
          v-for="action in bulkActions"
          :key="action.label"
          :label="action.label"
          color="neutral"
          variant="ghost"
          @click="change(selectedIds, action)"
        />
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Clear selection" @click="rowSelection = {}" />
      </div>
    </template>
  </UDashboardPanel>
</template>
