<script setup lang="ts">
// The account overview: memberships (to renew, or a link to join one when
// there are none and plans are on sale), loyalty points, recent orders and
// the default address
definePageMeta({ auth: true })
useSeoMeta({ title: 'Your account', robots: 'noindex' })

const money = useMoney()
const [{ data: memberships }, { data: loyalty }, { data: orders }, { data: addresses }] = await Promise.all([
  useFetch('/api/store/memberships', { key: 'memberships' }),
  useFetch('/api/store/loyalty', { key: 'loyalty' }),
  useFetch('/api/store/orders', { key: 'recent-orders', query: { size: 3 } }),
  useFetch('/api/store/addresses', { key: 'addresses' }),
])
const defaultAddress = computed(() => addresses.value?.find((a) => a.isDefault) ?? addresses.value?.[0])
</script>

<template>
  <AccountShell title="Your account">
    <div class="grid gap-10 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="recent-orders">
        <div class="mb-2 flex items-end justify-between">
          <h2 id="recent-orders" class="text-2xl font-medium">Recent orders</h2>
          <UButton v-if="orders?.pagination.total" to="/account/orders" label="All orders" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right" />
        </div>
        <ul v-if="orders?.results.length" class="divide-y divide-default border-y border-default">
          <li v-for="order in orders.results" :key="order.id">
            <AccountOrderRow :order="order" />
          </li>
        </ul>
        <div v-else class="space-y-4 py-8">
          <p class="text-muted">You have not placed an order yet.</p>
          <UButton to="/" label="Start shopping" trailing-icon="i-lucide-arrow-right" />
        </div>
      </section>

      <div class="order-first space-y-6 lg:order-none">
        <section v-if="memberships?.current.length" aria-labelledby="memberships" class="space-y-4 rounded-sm bg-muted p-6">
          <h2 id="memberships" class="font-sans text-xs font-medium tracking-wider text-muted uppercase">Memberships</h2>
          <AccountMembershipCard v-for="membership in memberships.current" :key="membership.plan.id" :membership="membership" />
          <UButton to="/account/memberships" label="All memberships" color="neutral" variant="link" class="px-0" />
        </section>
        <section v-else-if="memberships?.toJoin.length" aria-labelledby="memberships" class="space-y-2 rounded-sm bg-muted p-6">
          <h2 id="memberships" class="font-sans text-xs font-medium tracking-wider text-muted uppercase">Memberships</h2>
          <p class="text-muted">You are not a member yet.</p>
          <UButton to="/account/memberships" label="Join a membership" color="neutral" variant="link" class="px-0" trailing-icon="i-lucide-arrow-right" />
        </section>
        <section v-if="loyalty?.canRedeem || loyalty?.points" aria-labelledby="points" class="space-y-2 rounded-sm bg-muted p-6">
          <h2 id="points" class="font-sans text-xs font-medium tracking-wider text-muted uppercase">Loyalty points</h2>
          <p class="font-serif text-4xl" data-testid="points">{{ loyalty.points }}</p>
          <p class="text-sm text-muted">
            Worth {{ money(loyalty.value) }}<template v-if="loyalty.canRedeem">. Use them at checkout.</template>
          </p>
        </section>
        <section aria-labelledby="default-address" class="space-y-2 rounded-sm bg-muted p-6">
          <h2 id="default-address" class="font-sans text-xs font-medium tracking-wider text-muted uppercase">Default address</h2>
          <p v-if="defaultAddress">{{ addressLine(defaultAddress) }}</p>
          <p v-else class="text-muted">None saved yet.</p>
          <UButton to="/account/addresses" :label="defaultAddress ? 'Manage addresses' : 'Add an address'" color="neutral" variant="link" class="px-0" />
        </section>
      </div>
    </div>
  </AccountShell>
</template>
