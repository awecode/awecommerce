<script setup lang="ts">
// The buyer's memberships: the plans they hold, wait for, or held until
// recently, each with Renew; the plans they can join, by program; then every
// membership they have had
definePageMeta({ auth: true })
useSeoMeta({ title: 'Your memberships', robots: 'noindex' })

const { data } = await useFetch('/api/store/memberships', { key: 'memberships' })
const { data: settings } = useStoreSettings()
const day = (value: string) => new Intl.DateTimeFormat(settings.value?.locale ?? 'en-US', { dateStyle: 'medium' }).format(new Date(value))
const stateLabels = { active: 'Active', upcoming: 'Upcoming', ended: 'Ended', cancelled: 'Cancelled' } as const
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`
// The plans to join, grouped by program (already in program order)
const programs = computed(() => {
  const groups = new Map<string, NonNullable<typeof data.value>['toJoin']>()
  for (const option of data.value?.toJoin ?? []) groups.set(option.plan.program, [...(groups.get(option.plan.program) ?? []), option])
  return [...groups]
})
</script>

<template>
  <AccountShell title="Your memberships">
    <div class="space-y-12">
      <p v-if="!data?.history.length" class="pt-8 text-muted">You have no memberships yet.</p>
      <section v-if="data?.current.length" aria-labelledby="current" class="space-y-4">
        <h2 id="current" class="text-2xl font-medium">Current</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <AccountMembershipCard v-for="membership in data.current" :key="membership.plan.id" :membership="membership" class="rounded-sm bg-muted p-6" />
        </div>
      </section>
      <section v-if="programs.length" aria-labelledby="join" class="space-y-4">
        <h2 id="join" class="text-2xl font-medium">Join a membership</h2>
        <div v-for="[program, options] in programs" :key="program" class="space-y-3">
          <h3 class="font-sans text-xs font-medium tracking-wider text-muted uppercase">{{ program }}</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <AccountJoinPlanCard v-for="option in options" :key="option.plan.id" :option="option" class="rounded-sm bg-muted p-6" />
          </div>
        </div>
      </section>
      <section v-if="data?.history.length" aria-labelledby="history" class="space-y-4">
        <h2 id="history" class="text-2xl font-medium">History</h2>
        <ul class="divide-y divide-default border-y border-default">
          <li v-for="membership in data.history" :key="membership.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ membership.plan.name }} <span class="font-normal text-muted">· {{ months(membership.months) }}</span></p>
              <p class="text-sm text-muted">
                {{ day(membership.startsAt) }} to {{ day(membership.endsAt) }}
                <template v-if="membership.orderId"> · <NuxtLink :to="`/orders/${membership.orderId}`" class="underline">Order {{ membership.orderId }}</NuxtLink></template>
              </p>
            </div>
            <UBadge :label="stateLabels[membership.state]" color="neutral" :variant="membership.state === 'active' ? 'solid' : 'subtle'" />
          </li>
        </ul>
      </section>
    </div>
  </AccountShell>
</template>
