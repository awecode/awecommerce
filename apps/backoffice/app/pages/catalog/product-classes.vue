<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type ProductClass = CatalogRow & { taxRate: string | null; trackStock: boolean | null; requiresShipping: boolean; description: string | null }

useSeoMeta({ title: 'Product classes' })

const { data: tax } = useQuery({ key: ['tax-settings'], query: () => apiGet('/api/admin/settings/tax') })

const columns: TableColumn<ProductClass>[] = [
  {
    id: 'tax',
    header: 'Tax rate',
    cell: ({ row }) => (row.original.taxRate !== null ? `${Number(row.original.taxRate)}%` : 'Store default'),
    meta: { class: { td: 'tabular-nums' } },
  },
  {
    id: 'stock',
    header: 'Stock',
    cell: ({ row }) => (row.original.trackStock ? 'Tracked' : 'Not tracked'),
    meta: { class: { td: 'text-muted' } },
  },
  {
    id: 'shipping',
    header: 'Shipping',
    cell: ({ row }) => (row.original.requiresShipping ? 'Shipped' : 'Not shipped'),
    meta: { class: { td: 'text-muted' } },
  },
]
</script>

<template>
  <CatalogPage
    resource="product-classes"
    title="Product classes"
    singular="product class"
    icon="i-lucide-shapes"
    :columns="columns"
    :defaults="{ taxRate: '', trackStock: true, requiresShipping: true, description: '' }"
    :create-schema="createProductClassSchema"
    :update-schema="updateProductClassSchema"
  >
    <template #fields="form">
      <UFormField
        label="Tax rate (%)"
        name="taxRate"
        :help="`Empty uses the store default (${Number(tax?.defaultRate ?? 0)}%)`"
      >
        <UInput v-model="form.state.taxRate" inputmode="decimal" placeholder="Store default" class="w-32" />
      </UFormField>
      <UFormField name="trackStock">
        <USwitch v-model="form.state.trackStock" label="Track stock" description="Count stock for products of this class" />
      </UFormField>
      <UFormField name="requiresShipping">
        <USwitch
          v-model="form.state.requiresShipping"
          label="Ships to the buyer"
          description="Off for digital goods: an order of only these takes no address or shipping"
        />
      </UFormField>
      <UFormField label="Description" name="description">
        <UTextarea v-model="form.state.description" :rows="3" autoresize class="w-full" />
      </UFormField>
    </template>
  </CatalogPage>
</template>
