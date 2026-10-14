<script setup lang="ts" generic="Row extends CatalogRow">
import type { TableColumn } from '@nuxt/ui'
import type { ZodType } from 'zod'

// A list-and-edit screen for one catalog lookup (categories, brands, product
// classes): search and active filter in the URL, a table, and a side panel to
// create and edit. The page passes its extra columns and form fields.
const props = defineProps<{
  // API path under /api/admin, such as 'brands'
  resource: string
  title: string
  // Lower case, for messages: 'brand'
  singular: string
  icon: string
  columns: TableColumn<Row>[]
  // Values for a new record, besides name, slug and isActive
  defaults: Record<string, unknown>
  createSchema: ZodType
  updateSchema: ZodType
}>()

defineSlots<{
  // Extra form fields, bound to the form's state
  fields(props: { state: Record<string, any>; editing: Row | null }): any
}>()

// The resource path is only known at run time, so the typed routes do not apply
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const queryCache = useQueryCache()

// Filters live in the URL, so links and the back button keep them
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes } })
const page = computed(() => Number(route.query.page) || 1)
const active = computed(() => (route.query.active as string | undefined) ?? 'all')
const search = ref((route.query.q as string | undefined) ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: value || undefined, page: undefined }), 250)
})

const pageSize = 50
const { data, isLoading } = useQuery({
  key: () => [props.resource, { q: route.query.q, active: active.value, page: page.value }],
  query: () =>
    api<{ results: Row[]; pagination: { total: number } }>(`/api/admin/${props.resource}`, {
      query: {
        q: route.query.q || undefined,
        active: active.value === 'all' ? undefined : active.value,
        page: page.value,
        size: pageSize,
      },
    }),
})
const refresh = () => queryCache.invalidateQueries({ key: [props.resource] })

// ---- the side panel
const open = ref(false)
const editing = ref<Row | null>(null)
const state = reactive<Record<string, any>>({})
let initial = ''
// Follows the name until the slug is edited by hand
const slugTouched = ref(false)
const dirty = computed(() => open.value && JSON.stringify(state) !== initial)

const startForm = (row: Row | null) => {
  editing.value = row
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(
    state,
    row
      ? { ...props.defaults, ...Object.fromEntries(Object.keys(props.defaults).map((key) => [key, (row as any)[key]])), name: row.name, slug: row.slug, isActive: row.isActive ?? true }
      : { ...props.defaults, name: '', slug: '', isActive: true },
  )
  initial = JSON.stringify(state)
  slugTouched.value = Boolean(row)
  open.value = true
}
watch(() => state.name, (name) => {
  if (open.value && !slugTouched.value && typeof name === 'string') state.slug = slugify(name)
})

const closeForm = async () => {
  if (dirty.value && !(await confirm({ title: 'Discard changes?', description: 'Your changes have not been saved.', confirmLabel: 'Discard', color: 'error' }))) {
    return
  }
  open.value = false
}

// Empty optional text is sent as null, so it clears the field
const body = () =>
  Object.fromEntries(Object.entries(state).map(([key, value]) => [key, value === '' && key !== 'name' && key !== 'slug' ? null : value]))

const { mutate: save, isLoading: saving } = useMutation({
  mutation: () =>
    editing.value
      ? api(`/api/admin/${props.resource}/${editing.value.id}`, { method: 'PATCH', body: body() })
      : api(`/api/admin/${props.resource}`, { method: 'POST', body: body() }),
  onSuccess: () => {
    toast.add({ title: editing.value ? `Saved ${state.name}` : `Created ${state.name}`, color: 'success', icon: 'i-lucide-check' })
    initial = JSON.stringify(state)
    open.value = false
  },
  onError: (error) => toast.add({ title: 'Could not save', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' }),
  onSettled: refresh,
})

const setActive = async (row: Row, isActive: boolean) => {
  try {
    await api(`/api/admin/${props.resource}/${row.id}`, { method: 'PATCH', body: { isActive } })
    toast.add({ title: `${row.name} ${isActive ? 'activated' : 'deactivated'}`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not change it', description: apiErrorMessage(error), color: 'error' })
  }
  await refresh()
}

const remove = async (row: Row) => {
  if (!(await confirm({ title: `Delete ${row.name}?`, description: `This deletes the ${props.singular} for good.`, confirmLabel: 'Delete', color: 'error' }))) {
    return
  }
  try {
    await api(`/api/admin/${props.resource}/${row.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${row.name}`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    if (isInUse(error) && row.isActive) {
      const deactivate = await confirm({
        title: `${row.name} is in use`,
        description: `It cannot be deleted while products (or other records) use it. Deactivate it instead, to hide it from the store?`,
        confirmLabel: 'Deactivate',
      })
      if (deactivate) await setActive(row, false)
    } else {
      toast.add({ title: 'Could not delete', description: apiErrorMessage(error), color: 'error' })
    }
  }
  await refresh()
}

const columns = computed<TableColumn<Row>[]>(() => [
  { accessorKey: 'name', header: 'Name' },
  ...props.columns,
  { accessorKey: 'slug', header: 'Slug' },
  { id: 'status', header: 'Status' },
  { id: 'actions', header: '', meta: { class: { td: 'text-right w-10' } } },
])

const rowMenu = (row: Row) => [
  [{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startForm(row) }],
  [row.isActive
    ? { label: 'Deactivate', icon: 'i-lucide-eye-off', onSelect: () => setActive(row, false) }
    : { label: 'Activate', icon: 'i-lucide-eye', onSelect: () => setActive(row, true) }],
  [{ label: 'Delete', icon: 'i-lucide-trash', color: 'error' as const, onSelect: () => remove(row) }],
]

const searchInput = useTemplateRef('searchInput')
defineShortcuts({
  '/': () => searchInput.value?.inputRef?.focus(),
  meta_s: { usingInput: true, handler: () => { if (open.value && !saving.value) formRef.value?.submit() } },
})
const formRef = useTemplateRef('form')

// ⌘K "New …" links here with ?new=1
watch(() => route.query.new, (value) => {
  if (value) {
    startForm(null)
    setQuery({ new: undefined })
  }
}, { immediate: true })
</script>

<template>
  <UDashboardPanel :id="resource">
    <template #header>
      <UDashboardNavbar :title="title" :icon="icon">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" :label="`New ${singular}`" @click="startForm(null)" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UInput ref="searchInput" v-model="search" icon="i-lucide-search" placeholder="Search…" class="w-64">
          <template #trailing>
            <UKbd value="/" />
          </template>
        </UInput>
        <USelect
          :model-value="active"
          :items="[{ label: 'All', value: 'all' }, { label: 'Active', value: 'true' }, { label: 'Inactive', value: 'false' }]"
          class="w-32"
          @update:model-value="(value: string) => setQuery({ active: value === 'all' ? undefined : value, page: undefined })"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="data?.results ?? []"
        :columns="columns"
        :loading="isLoading"
        :empty="`No ${title.toLowerCase()} yet`"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => startForm(row.original)"
      >
        <template #name-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.name }}</span>
        </template>
        <template #slug-cell="{ row }">
          <span class="text-muted font-mono text-xs">{{ row.original.slug }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="row.original.isActive ? 'success' : 'neutral'" variant="subtle">
            {{ row.original.isActive ? 'Active' : 'Inactive' }}
          </UBadge>
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
    </template>
  </UDashboardPanel>

  <USlideover
    :open="open"
    :title="editing ? `Edit ${editing.name}` : `New ${singular}`"
    :dismissible="false"
    @close:prevent="closeForm"
    @update:open="(value: boolean) => !value && closeForm()"
  >
    <template #body>
      <UForm ref="form" :schema="editing ? updateSchema : createSchema" :state="state" class="space-y-4" @submit="save()">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Slug" name="slug" required help="Used in store links">
          <UInput v-model="state.slug" class="w-full font-mono" @update:model-value="slugTouched = true" />
        </UFormField>
        <slot name="fields" :state="state" :editing="editing" />
        <UFormField name="isActive">
          <USwitch v-model="state.isActive" label="Active" description="Inactive ones are hidden from the store" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <span v-if="dirty" class="mr-auto text-xs text-muted">Unsaved changes</span>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="closeForm" />
        <UButton :loading="saving" label="Save" @click="formRef?.submit()">
          <template #trailing>
            <UKbd value="meta" size="sm" /><UKbd value="s" size="sm" />
          </template>
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
