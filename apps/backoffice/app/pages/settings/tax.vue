<script setup lang="ts">
import { z } from 'zod'

// How tax is worked out: whether prices include it, the rate for products
// whose class has none, and whether shipping is taxed
useSeoMeta({ title: 'Tax settings' })

const formRef = useTemplateRef<{ validate: (options?: object) => Promise<unknown> }>('form')
const { state, loaded, dirty, saving, save, discard } = useSettingsForm({
  key: 'tax-settings',
  url: '/api/admin/settings/tax',
  fields: (settings) => ({
    pricesIncludeTax: Boolean(settings.pricesIncludeTax),
    defaultRate: trimDecimal(settings.defaultRate),
    taxShipping: Boolean(settings.taxShipping),
  }),
  body: (state) => ({ ...state, defaultRate: String(state.defaultRate).trim() }),
  savedTitle: 'Tax settings saved',
  form: formRef,
})

const schema = z.object({
  defaultRate: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter a rate, such as 13 or 12.5'),
})
</script>

<template>
  <UDashboardPanel id="settings-tax">
    <template #header>
      <SettingsHeader title="Tax" :dirty="dirty" :saving="saving" @save="save" @discard="discard" />
    </template>
    <template #body>
      <UForm v-if="loaded" ref="form" :schema="schema" :state="state" class="max-w-xl space-y-6" @submit.prevent>
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          description="Changes apply to carts and new orders. Orders already placed keep their tax."
        />
        <USwitch
          v-model="state.pricesIncludeTax"
          label="Prices include tax"
          description="Product and shipping prices already have tax in them; tax is shown as part of the price."
        />
        <UFormField label="Default tax rate" name="defaultRate" help="For products whose class has no rate of its own">
          <UInput v-model="state.defaultRate" inputmode="decimal" class="w-32">
            <template #trailing>
              <span class="text-xs text-muted">%</span>
            </template>
          </UInput>
        </UFormField>
        <USwitch v-model="state.taxShipping" label="Tax shipping" description="Shipping is taxed at the default rate." />
        <p class="text-sm text-muted">
          Product classes can have their own rate: see <NuxtLink to="/catalog/product-classes" class="underline">Product classes</NuxtLink>.
        </p>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
