<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Customers and staff, newest first: views (Customers, Staff, Banned, All),
// search by email and the page, all in the URL. Add staff makes an account
// staff by email. A row opens the person.
useSeoMeta({ title: 'Customers' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const queryCache = useQueryCache()
const { data: store } = useStoreSettings()

const param = (name: string) => (route.query[name] as string | undefined) || undefined
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes, page: undefined } })

const views = [
  { label: 'Customers', value: 'customers' },
  { label: 'Staff', value: 'staff' },
  { label: 'Banned', value: 'banned' },
  { label: 'All', value: 'all' },
]
const view = computed(() => param('view') ?? 'customers')
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
  role: view.value === 'customers' ? 'user' : view.value === 'staff' ? 'admin' : undefined,
  banned: view.value === 'banned' ? 'true' : undefined,
  page: page.value,
  size: pageSize,
}))
const { data, isLoading } = useQuery({
  key: () => ['users', listQuery.value],
  query: () => apiGet('/api/admin/users', { query: listQuery.value }),
})
type Person = NonNullable<typeof data.value>['results'][number]

const date = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium' }))
const columns: TableColumn<Person>[] = [
  { id: 'person', header: 'Name' },
  { id: 'role', header: 'Role' },
  { id: 'joined', header: 'Joined' },
  { id: 'status', header: 'Status' },
]

// ---- adding staff
const addOpen = ref(false)
const add = reactive({ email: '', name: '' })
const adding = ref(false)
const startAdd = () => {
  Object.assign(add, { email: '', name: '' })
  addOpen.value = true
}
const submitAdd = async () => {
  if (!add.email.trim()) return
  adding.value = true
  try {
    const { created, user } = await apiPost('/api/admin/users', { body: { email: add.email.trim(), name: add.name.trim() || undefined } })
    toast.add({ title: created ? `Added ${user.email} as staff` : `${user.email} is now staff`, color: 'success', icon: 'i-lucide-check' })
    addOpen.value = false
    await queryCache.invalidateQueries({ key: ['users'] })
  } catch (error) {
    toast.add({ title: 'Could not add them', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    adding.value = false
  }
}
// ⌘K "Add staff" links here with ?add=1
watch(() => route.query.add, (value) => {
  if (value) {
    startAdd()
    router.replace({ query: { ...route.query, add: undefined } })
  }
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="customers">
    <template #header>
      <UDashboardNavbar title="Customers" icon="i-lucide-users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span v-if="data" class="text-xs text-muted tabular-nums">{{ data.pagination.total }} {{ data.pagination.total === 1 ? 'person' : 'people' }}</span>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search by email…" class="w-60" />
          <UButton icon="i-lucide-user-plus" label="Add staff" @click="startAdd" />
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
            @update:model-value="(value) => setQuery({ view: value === 'customers' ? undefined : String(value) })"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="data?.results ?? []"
        :columns="columns"
        :loading="isLoading"
        empty="Nobody matches"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => navigateTo(`/customers/${row.original.id}`)"
      >
        <template #person-cell="{ row }">
          <p class="truncate text-highlighted">{{ row.original.name || row.original.email }}</p>
          <p v-if="row.original.name" class="truncate text-xs text-muted">{{ row.original.email }}</p>
        </template>
        <template #role-cell="{ row }">
          <UBadge :label="row.original.role === 'admin' ? 'Staff' : 'Customer'" :color="row.original.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" />
        </template>
        <template #joined-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ date.format(new Date(row.original.createdAt)) }}</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge v-if="row.original.banned" label="Banned" color="error" variant="subtle" />
          <span v-else-if="!row.original.emailVerified" class="text-xs text-muted">Not signed in yet</span>
        </template>
      </UTable>

      <div v-if="(data?.pagination.total ?? 0) > pageSize" class="flex justify-end border-t border-default pt-3">
        <UPagination :page="page" :items-per-page="pageSize" :total="data!.pagination.total" @update:page="(value: number) => router.replace({ query: { ...route.query, page: String(value) } })" />
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="addOpen" title="Add staff" description="An existing account with this email becomes staff; otherwise one is made. They sign in with the emailed link." :ui="{ footer: 'justify-end' }">
    <template #body>
      <UForm :state="add" class="space-y-4" @submit="submitAdd">
        <UFormField label="Email" name="email" required>
          <UInput v-model="add.email" type="email" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Name" name="name" hint="Optional" help="For a new account; the part of the email before @ otherwise">
          <UInput v-model="add.name" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="addOpen = false" />
      <UButton label="Add staff" :loading="adding" :disabled="!add.email.trim()" @click="submitAdd" />
    </template>
  </UModal>
</template>
