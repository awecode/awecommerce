<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type Category = CatalogRow & {
  parentId: number | null
  parent: { name: string } | null
  logo: string | null
  description: string | null
  isFeatured: boolean
  order: number | null
}

// In the script, not the template: a "//" in this slot's template trips up
// vue-tsc's type checking of the rest of the slot
const logoPlaceholder = 'https://example.com/logo.png'

useSeoMeta({ title: 'Categories' })

const columns: TableColumn<Category>[] = [
  { id: 'parent', header: 'Parent', cell: ({ row }) => row.original.parent?.name ?? '', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'order', header: 'Order', meta: { class: { th: 'w-20', td: 'tabular-nums text-muted' } } },
  { id: 'featured', header: 'Home page', cell: ({ row }) => (row.original.isFeatured ? 'Featured' : ''), meta: { class: { td: 'text-muted' } } },
]

// Every category, for the parent picker
const { data: all } = useQuery({
  key: ['categories', 'all'],
  query: () => apiGet('/api/admin/categories', { query: { size: 100 } }),
})

// Parents a category can move under: not itself, nor one of its subcategories
const parentOptions = (editing: Category | null) => {
  const rows = all.value?.results ?? []
  const excluded = new Set<number>()
  if (editing) {
    const queue = [editing.id]
    while (queue.length) {
      const id = queue.pop()!
      excluded.add(id)
      queue.push(...rows.filter((row) => row.parentId === id && !excluded.has(row.id)).map((row) => row.id))
    }
  }
  return [
    { label: 'None (top level)', value: null },
    ...rows.filter((row) => !excluded.has(row.id)).map((row) => ({ label: row.name, value: row.id })),
  ]
}
</script>

<template>
  <CatalogPage
    resource="categories"
    title="Categories"
    singular="category"
    icon="i-lucide-folder-tree"
    :columns="columns"
    :defaults="{ parentId: null, order: 1, isFeatured: false, logo: '', description: '' }"
    :create-schema="createCategorySchema"
    :update-schema="updateCategorySchema"
  >
    <template #fields="form">
      <UFormField label="Parent" name="parentId">
        <USelectMenu
          v-model="form.state.parentId"
          :items="parentOptions(form.editing as Category | null)"
          value-key="value"
          placeholder="None (top level)"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Order" name="order" help="Lowest first, in the menu and on the home page">
        <UInputNumber v-model="form.state.order" :min="0" class="w-32" />
      </UFormField>
      <UFormField name="isFeatured">
        <USwitch v-model="form.state.isFeatured" label="Featured" description="Shows a row of its newest products on the home page" />
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
