<script setup lang="ts">
// One person: their account (name, role, ban), recent orders, memberships
// (grant, extend, cancel), saved addresses and loyalty points. Each action
// saves at once.

// Paths with an id are only known at run time, so the typed routes do not apply
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const route = useRoute()
const toast = useToast()
const confirm = useConfirm()
const prompt = usePrompt()
const money = useMoney()
const queryCache = useQueryCache()
const { data: store } = useStoreSettings()

const id = computed(() => String(route.params.id))
const { data: person, error } = useQuery({
  key: () => ['user', id.value],
  query: () => apiGetAt('/api/admin/users/:id', `/api/admin/users/${id.value}`),
})
const user = computed(() => person.value?.user)
useSeoMeta({ title: () => user.value?.name || user.value?.email || 'Customer' })
const refresh = async () => {
  await queryCache.invalidateQueries({ key: ['user', id.value] })
  await queryCache.invalidateQueries({ key: ['users'] })
}

const date = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium' }))
const day = (value: string | Date) => date.value.format(new Date(value))

// Runs an action, says how it went, and reloads the person
const act = async (action: () => Promise<unknown>, done: string) => {
  try {
    await action()
    toast.add({ title: done, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not do that', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refresh()
}

// ---- the account
const rename = async () => {
  const name = await prompt({ title: 'Change name', label: 'Name', value: user.value?.name ?? '' })
  if (name) await act(() => api(`/api/admin/users/${id.value}`, { method: 'PATCH', body: { name } }), 'Name changed')
}
const setRole = async (role: 'admin' | 'user') => {
  const toStaff = role === 'admin'
  const go = await confirm({
    title: toStaff ? 'Make staff?' : 'Remove from staff?',
    description: toStaff ? 'They get full access to the backoffice.' : 'They lose access to the backoffice and become a customer.',
    confirmLabel: toStaff ? 'Make staff' : 'Remove from staff',
    color: toStaff ? 'primary' : 'error',
  })
  if (go) await act(() => api(`/api/admin/users/${id.value}`, { method: 'PATCH', body: { role } }), toStaff ? 'Now staff' : 'No longer staff')
}
const ban = async () => {
  const reason = await prompt({ title: 'Ban this account?', label: 'Reason', confirmLabel: 'Ban' })
  if (reason) await act(() => api(`/api/admin/users/${id.value}/ban`, { method: 'POST', body: { reason } }), 'Banned and signed out')
}
const unban = () => act(() => api(`/api/admin/users/${id.value}/unban`, { method: 'POST' }), 'Ban lifted')
const menu = computed(() => [
  [{ label: 'Change name', icon: 'i-lucide-pencil', onSelect: rename }],
  [
    user.value?.role === 'admin'
      ? { label: 'Remove from staff', icon: 'i-lucide-user-minus', onSelect: () => setRole('user') }
      : { label: 'Make staff', icon: 'i-lucide-shield', onSelect: () => setRole('admin') },
  ],
  [
    user.value?.banned
      ? { label: 'Lift ban', icon: 'i-lucide-circle-check', onSelect: unban }
      : { label: 'Ban', icon: 'i-lucide-ban', color: 'error' as const, onSelect: ban },
  ],
])

// ---- memberships
const { data: plans } = useQuery({
  key: ['membership-plans', 'all'],
  query: () => apiGet('/api/admin/membership-plans', { query: { size: 100 } }),
})
const planItems = computed(() =>
  (plans.value?.results ?? []).filter((plan) => plan.isActive).map((plan) => ({ label: `${plan.name} (${plan.program})`, value: plan.id })),
)
const grant = reactive({ planId: undefined as number | undefined, months: 12 })
const grantPlan = (planId: number, months: number, done: string) =>
  act(() => api('/api/admin/memberships', { method: 'POST', body: { userId: id.value, planId, months } }), done)
const extend = async (planId: number, planName: string) => {
  const months = Number(await prompt({ title: `Extend ${planName}`, label: 'Months to add', value: '12', confirmLabel: 'Extend' }))
  if (Number.isInteger(months) && months > 0) await grantPlan(planId, months, `${planName} extended`)
}
const cancelMembership = async (membershipId: number, planName: string) => {
  const reason = await prompt({ title: `Cancel ${planName}?`, label: 'Reason', confirmLabel: 'Cancel membership' })
  if (reason) await act(() => api(`/api/admin/memberships/${membershipId}/cancel`, { method: 'POST', body: { reason } }), `${planName} cancelled`)
}
const stateColor = { active: 'success', upcoming: 'info', ended: 'neutral', cancelled: 'error' } as const

type SavedAddress = Record<'line1' | 'line2' | 'city' | 'province' | 'postalCode' | 'country', string | null>
const address = (a: SavedAddress) =>
  [a.line1, a.line2, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(', ')
</script>

<template>
  <UDashboardPanel id="customer">
    <template #header>
      <UDashboardNavbar :title="user?.name || user?.email || ''">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/customers" aria-label="Back to customers" />
        </template>
        <template v-if="user" #trailing>
          <UBadge :label="user.role === 'admin' ? 'Staff' : 'Customer'" :color="user.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" />
          <UBadge v-if="user.banned" label="Banned" color="error" variant="subtle" />
        </template>
        <template v-if="user" #right>
          <UDropdownMenu :items="menu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="More actions" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-user-x"
        :title="isNotFound(error) ? 'No such person' : 'This person could not be loaded'"
        :description="isNotFound(error) ? 'They may have been deleted.' : apiErrorMessage(error)"
        :actions="[{ label: 'Back to customers', to: '/customers', color: 'neutral', variant: 'outline' }]"
        class="m-auto"
      />
      <div v-else-if="person && user" class="@container">
        <div class="flex flex-col gap-8 @4xl:flex-row">
          <div class="min-w-0 flex-1 space-y-8">
            <section class="space-y-3" aria-labelledby="orders">
              <div class="flex items-center justify-between">
                <h2 id="orders" class="text-sm font-semibold text-highlighted">Orders <span class="font-normal text-muted">· {{ person.orders.total }}</span></h2>
                <UButton v-if="person.orders.total" :to="{ path: '/orders', query: { view: 'all', q: user.email } }" label="All orders" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right" />
              </div>
              <ul v-if="person.orders.results.length" class="divide-y divide-default rounded-md border border-default text-sm">
                <li v-for="order in person.orders.results" :key="order.id">
                  <NuxtLink :to="`/orders/${order.id}`" class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/50">
                    <span class="w-16 font-medium text-highlighted tabular-nums">#{{ order.id }}</span>
                    <span class="flex-1 text-muted">{{ day(order.createdAt!) }} · {{ order.items }} item{{ order.items === 1 ? '' : 's' }}</span>
                    <span class="tabular-nums">{{ money(order.total) }}</span>
                    <UBadge :label="order.status" :color="statusColor[order.status as OrderStatus]" variant="subtle" />
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="text-sm text-muted">No orders yet.</p>
            </section>

            <section class="space-y-3" aria-labelledby="memberships" role="region" aria-label="Memberships">
              <h2 id="memberships" class="text-sm font-semibold text-highlighted">Memberships</h2>
              <ul v-if="person.memberships.length" class="divide-y divide-default rounded-md border border-default text-sm">
                <li v-for="membership in person.memberships" :key="membership.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <p class="text-highlighted">{{ membership.plan.name }} <span class="text-muted">· {{ membership.months }} month{{ membership.months === 1 ? '' : 's' }}</span></p>
                    <p class="text-xs text-muted">
                      {{ day(membership.startsAt) }} to {{ day(membership.endsAt) }}
                      <template v-if="membership.orderId"> · <NuxtLink :to="`/orders/${membership.orderId}`" class="hover:underline">Order #{{ membership.orderId }}</NuxtLink></template>
                      <template v-if="membership.cancellationReason"> · Cancelled: {{ membership.cancellationReason }}</template>
                    </p>
                  </div>
                  <UBadge :label="membership.state" :color="stateColor[membership.state]" variant="subtle" class="capitalize" />
                  <template v-if="membership.state === 'active' || membership.state === 'upcoming'">
                    <UButton label="Extend" color="neutral" variant="ghost" size="xs" @click="extend(membership.planId, membership.plan.name)" />
                    <UButton label="Cancel" color="error" variant="ghost" size="xs" @click="cancelMembership(membership.id, membership.plan.name)" />
                  </template>
                </li>
              </ul>
              <p v-else class="text-sm text-muted">No memberships.</p>
              <div class="flex flex-wrap items-center gap-2">
                <USelect v-model="grant.planId" :items="planItems" placeholder="Plan" aria-label="Plan to grant" class="w-48" />
                <UInputNumber v-model="grant.months" :min="1" :max="120" aria-label="Months to grant" class="w-28" />
                <UButton
                  label="Grant"
                  color="neutral"
                  variant="outline"
                  :disabled="!grant.planId"
                  @click="grantPlan(grant.planId!, grant.months, 'Membership granted')"
                />
              </div>
            </section>

            <section class="space-y-3" aria-labelledby="addresses">
              <h2 id="addresses" class="text-sm font-semibold text-highlighted">Addresses</h2>
              <ul v-if="person.addresses.length" class="space-y-1 text-sm">
                <li v-for="saved in person.addresses" :key="saved.id">
                  {{ address(saved) }} <UBadge v-if="saved.isDefault" label="Default" color="neutral" variant="outline" class="ml-1" />
                </li>
              </ul>
              <p v-else class="text-sm text-muted">None saved.</p>
            </section>
          </div>

          <aside class="space-y-6 text-sm @4xl:w-72 @4xl:shrink-0">
            <section class="space-y-1" aria-labelledby="account">
              <h2 id="account" class="text-xs font-medium text-muted">Account</h2>
              <p class="text-highlighted">{{ user.name }}</p>
              <p class="text-muted">{{ user.email }}</p>
              <p class="text-muted">Joined {{ day(user.createdAt) }}<template v-if="!user.emailVerified"> · not signed in yet</template></p>
              <UButton label="Change name" color="neutral" variant="link" class="px-0" @click="rename" />
            </section>
            <section v-if="user.banned" class="space-y-1" aria-labelledby="ban">
              <h2 id="ban" class="text-xs font-medium text-muted">Banned</h2>
              <p>{{ user.banReason || 'No reason given' }}</p>
              <p v-if="user.banExpires" class="text-muted">Until {{ day(user.banExpires) }}</p>
              <UButton label="Lift ban" color="neutral" variant="outline" size="sm" @click="unban" />
            </section>
            <section class="space-y-1" aria-labelledby="points">
              <h2 id="points" class="text-xs font-medium text-muted">Loyalty points</h2>
              <p class="text-2xl font-medium text-highlighted tabular-nums" data-testid="points">{{ Number(person.loyalty.points) }}</p>
              <p class="text-muted">Worth {{ money(person.loyalty.value) }}, redeemable now</p>
            </section>
          </aside>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
