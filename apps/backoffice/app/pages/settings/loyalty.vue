<script setup lang="ts">
import { z } from 'zod'

// Loyalty points: whether they are on, how many the app awards per amount
// spent, what a point is worth at checkout, and when points expire. Points are
// awarded by the app (addLoyaltyPoint), never automatically.
useSeoMeta({ title: 'Loyalty settings' })

const money = useMoney()
const formRef = useTemplateRef<{ validate: (options?: object) => Promise<unknown> }>('form')
const { state, loaded, dirty, saving, save, discard } = useSettingsForm({
  key: 'loyalty-settings',
  url: '/api/admin/settings/loyalty',
  fields: (settings) => ({
    isEnabled: Boolean(settings.isEnabled),
    earnRate: settings.earnRate === null ? '' : trimDecimal(settings.earnRate),
    redeemRate: settings.redeemRate === null ? '' : trimDecimal(settings.redeemRate),
    // Text, so ⌘S right after typing saves it (a number field commits on blur)
    expiresAfterInDays: settings.expiresAfterInDays === null ? '' : String(settings.expiresAfterInDays),
  }),
  body: (state) => ({
    isEnabled: state.isEnabled,
    earnRate: String(state.earnRate).trim() || null,
    redeemRate: String(state.redeemRate).trim() || null,
    expiresAfterInDays: String(state.expiresAfterInDays).trim() ? Number(state.expiresAfterInDays) : null,
  }),
  savedTitle: 'Loyalty settings saved',
  form: formRef,
})

const rate = z.string().trim().regex(/^(\d+(\.\d+)?)?$/, 'Enter a number, such as 1 or 0.5')
const schema = z.object({
  earnRate: rate,
  redeemRate: rate,
  expiresAfterInDays: z.string().trim().regex(/^([1-9]\d*)?$/, 'Enter a number of days, such as 365'),
})

// "Spending $100 earns 100 points, worth $1.00 at checkout."
const example = computed(() => {
  const earn = Number(state.earnRate)
  const worth = Number(state.redeemRate)
  if (!state.earnRate || !Number.isFinite(earn)) return 'Without points per amount spent, nothing is earned.'
  const points = Math.round(100 * earn * 100) / 100
  return `Spending ${money(100)} earns ${points} point${points === 1 ? '' : 's'}${state.redeemRate && Number.isFinite(worth) ? `, worth ${money(points * worth)} at checkout` : ', which cannot be redeemed yet'}.`
})
</script>

<template>
  <UDashboardPanel id="settings-loyalty">
    <template #header>
      <SettingsHeader title="Loyalty" :dirty="dirty" :saving="saving" @save="save" @discard="discard" />
    </template>
    <template #body>
      <UForm v-if="loaded" ref="form" :schema="schema" :state="state" class="max-w-xl space-y-6" @submit.prevent>
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Points are awarded by your app (it calls addLoyaltyPoint, for example when an order is completed), not automatically. Customers redeem them at checkout."
        />
        <USwitch
          v-model="state.isEnabled"
          label="Loyalty points"
          description="Off: no points are awarded or redeemed; customers keep the points they have."
        />
        <UFormField label="Points per amount spent" name="earnRate" help="Points for each 1 of the store's currency; empty awards none">
          <UInput v-model="state.earnRate" inputmode="decimal" placeholder="1" class="w-32" />
        </UFormField>
        <UFormField label="Value of one point" name="redeemRate" help="What a point takes off at checkout; empty means points cannot be redeemed">
          <UInput v-model="state.redeemRate" inputmode="decimal" placeholder="0.01" class="w-32" />
        </UFormField>
        <UFormField label="Points expire after" name="expiresAfterInDays" hint="Optional" help="Days after they are earned; empty for never. Applies to points earned from now on.">
          <div class="flex items-center gap-2">
            <UInput v-model="state.expiresAfterInDays" inputmode="numeric" placeholder="Never" aria-label="Points expire after" class="w-32" />
            <span class="text-sm text-muted">days</span>
          </div>
        </UFormField>
        <p class="text-sm text-muted" data-testid="loyalty-example">{{ example }}</p>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
