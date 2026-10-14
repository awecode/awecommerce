<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type Brand = CatalogRow & { order: number | null; logo: string | null; description: string | null }

// In the script, not the template: a "//" in this slot's template trips up
// vue-tsc's type checking of the rest of the slot
const logoPlaceholder = 'https://example.com/logo.png'

useSeoMeta({ title: 'Brands' })

const columns: TableColumn<Brand>[] = [
  { accessorKey: 'order', header: 'Order', meta: { class: { th: 'w-20', td: 'tabular-nums text-muted' } } },
]
</script>

<template>
  <CatalogPage
    resource="brands"
    title="Brands"
    singular="brand"
    icon="i-lucide-tag"
    :columns="columns"
    :defaults="{ order: 1, logo: '', description: '' }"
    :create-schema="createBrandSchema"
    :update-schema="updateBrandSchema"
  >
    <template #fields="form">
      <UFormField label="Menu order" name="order" help="Lowest first">
        <UInputNumber v-model="form.state.order" :min="0" class="w-32" />
      </UFormField>
      <UFormField label="Logo URL" name="logo">
        <UInput v-model="form.state.logo" type="url" :placeholder="logoPlaceholder" class="w-full" />
      </UFormField>
      <UFormField label="Description" name="description">
        <UTextarea v-model="form.state.description" :rows="3" autoresize class="w-full" />
      </UFormField>
    </template>
  </CatalogPage>
</template>
