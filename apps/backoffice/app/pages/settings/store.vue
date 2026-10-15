<script setup lang="ts">
import { z } from 'zod'

// The store's name, and the currency and locale prices are shown in, in the
// storefront, the backoffice and order emails
useSeoMeta({ title: 'Store settings' })

const formRef = useTemplateRef<{ validate: (options?: object) => Promise<unknown> }>('form')
const { state, loaded, dirty, saving, save, discard } = useSettingsForm({
  key: 'store-settings',
  url: '/api/admin/settings/store',
  fields: (settings) => ({ name: String(settings.name ?? ''), currency: String(settings.currency), locale: String(settings.locale) }),
  savedTitle: 'Store settings saved',
  form: formRef,
})

const schema = z.object({
  currency: z.string().length(3, 'Choose a currency'),
  locale: z.string().trim().min(2, 'Enter a locale, such as en-US'),
})

// The codes the server accepts, with their names
const supported = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('currency')
const names = new Intl.DisplayNames(['en'], { type: 'currency' })
const currencies = supported.map((code) => ({ label: `${code} · ${names.of(code) ?? code}`, value: code }))

// A price as the storefront will show it, or null when the browser does not
// know the locale
const sample = computed(() => {
  try {
    return new Intl.NumberFormat(String(state.locale).trim(), { style: 'currency', currency: String(state.currency) }).format(1234.5)
  } catch {
    return null
  }
})
</script>

<template>
  <UDashboardPanel id="settings-store">
    <template #header>
      <SettingsHeader title="Store" :dirty="dirty" :saving="saving" @save="save" @discard="discard" />
    </template>
    <template #body>
      <UForm v-if="loaded" ref="form" :schema="schema" :state="state" class="max-w-xl space-y-5" @submit.prevent>
        <UFormField label="Store name" name="name" help="Shown in the storefront's header, page titles and order emails">
          <UInput v-model="state.name" placeholder="Store" class="w-full" />
        </UFormField>
        <UFormField label="Currency" name="currency" help="Prices are not converted: the same amounts are shown in the new currency.">
          <USelectMenu v-model="state.currency" :items="currencies" value-key="value" class="w-72" />
        </UFormField>
        <UFormField label="Locale" name="locale" help="How prices and dates are written, such as en-US or ne-NP">
          <UInput v-model="state.locale" class="w-40 font-mono" />
        </UFormField>
        <div class="rounded-md border border-default bg-elevated/40 px-3 py-2 text-sm">
          <span class="text-muted">A price will look like </span>
          <span v-if="sample" class="font-medium text-highlighted">{{ sample }}</span>
          <span v-else class="text-error">Not a locale this browser knows</span>
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
