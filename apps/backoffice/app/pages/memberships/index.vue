<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Memberships, latest start first: search (member email or name), plan and
// state filters, and the page, all in the URL. Grant gives a plan to a
// customer; a row opens the member's history, to extend or cancel.
useSeoMeta({ title: 'Members' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const prompt = usePrompt()
const queryCache = useQueryCache()
const store = useStoreSettings()
// Paths with an id are only known at run time
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const param = (name: string) => (route.query[name] as string | undefined) || undefined
const setQuery = (changes: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...changes, page: undefined } })
const page = computed(() => Number(param('page')) || 1)

const search = ref(param('q') ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: value.trim() || undefined }), 250)
})

const pageSize = 50
const listQuery = computed(() => ({ q: param('q'), plan: param('plan'), state: param('state'), page: page.value, size: pageSize }))
const { data, isLoading } = useQuery({
  key: () => ['memberships', listQuery.value],
  query: () => apiGet('/api/admin/memberships', { query: listQuery.value }),
})
type Membership = NonNullable<typeof data.value>['results'][number]
const refresh = () => queryCache.invalidateQueries({ key: ['memberships'] })

// The plan filter, as a number for the picker
const planFilter = computed(() => (param('plan') ? Number(param('plan')) : undefined))
const stateItems = [
  { label: 'Any state', value: 'any' },
  { label: 'Active', value: 'active' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Ended', value: 'ended' },
  { label: 'Cancelled', value: 'cancelled' },
]
const stateColor = { active: 'success', upcoming: 'info', ended: 'neutral', cancelled: 'error' } as const

const date = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium' }))
const day = (value: string) => date.value.format(new Date(value))

const columns: TableColumn<Membership>[] = [
  { id: 'member', header: 'Member' },
  { id: 'plan', header: 'Plan' },
  { id: 'starts', header: 'Starts' },
  { id: 'ends', header: 'Ends' },
  { id: 'state', header: 'State' },
  { id: 'source', header: 'From' },
]

// ---- granting a plan
const grantOpen = ref(false)
const grant = reactive({ userId: undefined as string | undefined, planId: undefined as number | undefined, months: 12 })
const userSearch = ref('')
const userQ = ref('')
let userTimer: ReturnType<typeof setTimeout> | undefined
watch(userSearch, (value) => {
  clearTimeout(userTimer)
  userTimer = setTimeout(() => (userQ.value = value.trim()), 250)
})
const { data: users } = useQuery({
  key: () => ['users', 'grant-search', userQ.value],
  query: () => apiGet('/api/admin/users', { query: { q: userQ.value || undefined, size: 20 } }),
  enabled: () => grantOpen.value,
})
const userItems = computed(() => (users.value?.results ?? []).map((user) => ({ label: user.email, description: user.name, value: user.id })))
const startGrant = () => {
  Object.assign(grant, { userId: undefined, planId: undefined, months: 12 })
  grantOpen.value = true
}
const granting = ref(false)
const submitGrant = async () => {
  if (!grant.userId || !grant.planId) return
  granting.value = true
  try {
    await api('/api/admin/memberships', { method: 'POST', body: { ...grant } })
    toast.add({ title: 'Membership granted', color: 'success', icon: 'i-lucide-check' })
    grantOpen.value = false
  } catch (error) {
    toast.add({ title: 'Could not grant it', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    granting.value = false
    await refresh()
  }
}
// ⌘K "Grant membership" links here with ?grant=1
watch(() => route.query.grant, (value) => {
  if (value) {
    startGrant()
    router.replace({ query: { ...route.query, grant: undefined } })
  }
}, { immediate: true })

// ---- one member's history
const person = ref<Membership | null>(null)
const { data: history } = useQuery({
  key: () => ['memberships', 'history', person.value?.userId ?? ''],
  query: () => api<{ results: Membership[] }>('/api/admin/memberships', { query: { userId: person.value!.userId, size: 100 } }),
  enabled: () => person.value !== null,
})
const extendMonths = ref(12)
const extending = ref(false)
const extend = async (membership: Membership) => {
  extending.value = true
  try {
    await api('/api/admin/memberships', { method: 'POST', body: { userId: membership.userId, planId: membership.planId, months: extendMonths.value } })
    toast.add({ title: `${membership.plan.name} extended`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not extend it', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    extending.value = false
    await refresh()
  }
}
const cancel = async (membership: Membership) => {
  const reason = await prompt({ title: `Cancel ${membership.plan.name}?`, label: 'Reason', confirmLabel: 'Cancel membership' })
  if (!reason) return
  try {
    await api(`/api/admin/memberships/${membership.id}/cancel`, { method: 'POST', body: { reason } })
    toast.add({ title: `${membership.plan.name} cancelled`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not cancel it', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refresh()
}
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`
</script>

<template>
  <UDashboardPanel id="memberships">
    <template #header>
      <UDashboardNavbar title="Members" icon="i-lucide-crown">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span v-if="data" class="text-xs text-muted tabular-nums">{{ data.pagination.total }} membership{{ data.pagination.total === 1 ? '' : 's' }}</span>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search members…" class="w-60" />
          <UButton icon="i-lucide-plus" label="Grant membership" @click="startGrant" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #right>
          <MembershipsPlanPicker
            :model-value="planFilter"
            clear
            placeholder="Any plan"
            aria-label="Plan"
            class="w-48"
            @update:model-value="(value) => setQuery({ plan: typeof value === 'number' ? String(value) : undefined })"
          />
          <USelect
            :model-value="param('state') ?? 'any'"
            :items="stateItems"
            aria-label="State"
            class="w-36"
            @update:model-value="(value) => setQuery({ state: value === 'any' ? undefined : String(value) })"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UTable
        :data="data?.results ?? []"
        :columns="columns"
        :loading="isLoading"
        empty="No memberships match"
        sticky="header"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => (person = row.original)"
      >
        <template #member-cell="{ row }">
          <div class="min-w-0">
            <p class="truncate text-highlighted">{{ row.original.member?.name || row.original.member?.email || row.original.userId }}</p>
            <p v-if="row.original.member?.name" class="truncate text-xs text-muted">{{ row.original.member.email }}</p>
          </div>
        </template>
        <template #plan-cell="{ row }">
          {{ row.original.plan.name }} <span class="text-muted">· {{ row.original.plan.program }}</span>
        </template>
        <template #starts-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ day(row.original.startsAt) }}</span>
        </template>
        <template #ends-cell="{ row }">
          <span class="whitespace-nowrap text-muted">{{ day(row.original.endsAt) }}</span>
        </template>
        <template #state-cell="{ row }">
          <UBadge :label="row.original.state" :color="stateColor[row.original.state]" variant="subtle" class="capitalize" />
        </template>
        <template #source-cell="{ row }">
          <NuxtLink v-if="row.original.orderId" :to="`/orders/${row.original.orderId}`" class="hover:underline" @click.stop>Order #{{ row.original.orderId }}</NuxtLink>
          <span v-else class="text-muted">{{ row.original.grantedByEmail ?? 'Staff' }}</span>
        </template>
      </UTable>

      <div v-if="(data?.pagination.total ?? 0) > pageSize" class="flex justify-end border-t border-default pt-3">
        <UPagination :page="page" :items-per-page="pageSize" :total="data!.pagination.total" @update:page="(value: number) => router.replace({ query: { ...route.query, page: String(value) } })" />
      </div>
    </template>
  </UDashboardPanel>

  <USlideover v-model:open="grantOpen" title="Grant membership">
    <template #body>
      <UForm :state="grant" class="space-y-4" @submit="submitGrant">
        <UFormField label="Customer" name="userId" required>
          <USelectMenu
            v-model="grant.userId"
            v-model:search-term="userSearch"
            :items="userItems"
            value-key="value"
            ignore-filter
            placeholder="Search by email"
            aria-label="Customer"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Plan" name="planId" required help="The same plan again starts when the current one ends; a higher tier replaces a lower one">
          <MembershipsPlanPicker v-model="grant.planId" active-only placeholder="Choose a plan" aria-label="Plan" class="w-full" />
        </UFormField>
        <UFormField label="Months" name="months" required>
          <UInputNumber v-model="grant.months" :min="1" :max="120" class="w-32" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="grantOpen = false" />
        <UButton label="Grant" :loading="granting" :disabled="!grant.userId || !grant.planId" @click="submitGrant" />
      </div>
    </template>
  </USlideover>

  <USlideover
    :open="person !== null"
    :title="person?.member?.name || person?.member?.email || 'Member'"
    :description="person?.member?.name ? person.member.email : undefined"
    @update:open="(value: boolean) => !value && (person = null)"
  >
    <template #body>
      <div v-if="person" class="space-y-6">
        <section class="space-y-2" aria-label="Extend">
          <h3 class="text-sm font-semibold text-highlighted">Extend {{ person.plan.name }}</h3>
          <p class="text-xs text-muted">Adds a {{ person.plan.name }} membership that starts when the current one ends.</p>
          <div class="flex items-center gap-2">
            <UInputNumber v-model="extendMonths" :min="1" :max="120" aria-label="Months to add" class="w-28" />
            <span class="text-sm text-muted">months</span>
            <UButton label="Extend" color="neutral" variant="outline" :loading="extending" @click="extend(person)" />
          </div>
        </section>
        <section class="space-y-2" aria-label="History">
          <h3 class="text-sm font-semibold text-highlighted">History</h3>
          <ul class="divide-y divide-default rounded-md border border-default">
            <li v-for="membership in history?.results ?? []" :key="membership.id" class="space-y-1 px-3 py-2 text-sm">
              <div class="flex items-center gap-2">
                <span class="flex-1 font-medium text-highlighted">{{ membership.plan.name }} <span class="font-normal text-muted">· {{ months(membership.months) }}</span></span>
                <UBadge :label="membership.state" :color="stateColor[membership.state]" variant="subtle" class="capitalize" />
                <UButton
                  v-if="membership.state === 'active' || membership.state === 'upcoming'"
                  label="Cancel"
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="cancel(membership)"
                />
              </div>
              <p class="text-xs text-muted">
                {{ day(membership.startsAt) }} to {{ day(membership.endsAt) }} ·
                <NuxtLink v-if="membership.orderId" :to="`/orders/${membership.orderId}`" class="hover:underline">Order #{{ membership.orderId }}</NuxtLink>
                <template v-else>Granted by {{ membership.grantedByEmail ?? 'staff' }}</template>
              </p>
              <p v-if="membership.cancellationReason" class="text-xs text-muted">Cancelled: {{ membership.cancellationReason }}</p>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </USlideover>
</template>
