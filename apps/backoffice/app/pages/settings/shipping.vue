<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'

// The shipping methods buyers choose from at checkout: a name and a price.
// Orders keep their own copy of the method, so deleting one does not change
// them.
useSeoMeta({ title: 'Shipping methods' })

const toast = useToast()
const confirm = useConfirm()
const money = useMoney()
const queryCache = useQueryCache()
// Paths with an id are only known at run time
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const { data: methods, isLoading } = useQuery({
  key: ['shipping-methods'],
  query: () => apiGet('/api/admin/shipping-methods'),
})
type Method = NonNullable<typeof methods.value>[number]
const refresh = () => queryCache.invalidateQueries({ key: ['shipping-methods'] })

const columns: TableColumn<Method>[] = [
  { accessorKey: 'name', header: 'Name' },
  { id: 'price', header: 'Price', meta: { class: { td: 'tabular-nums' } } },
  { id: 'actions', meta: { class: { td: 'text-right w-10' } } },
]
const price = (method: Method) => (Number(method.price) ? money(method.price) : 'Free')

// ---- the side panel, for a new method or one being edited
const open = ref(false)
const editing = ref<Method | null>(null)
const state = reactive({ name: '', price: '' })
let initial = ''
const dirty = computed(() => open.value && JSON.stringify(state) !== initial)
const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  price: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter a price, such as 5 or 4.99'),
})

const startForm = (method: Method | null) => {
  editing.value = method
  state.name = method?.name ?? ''
  state.price = method ? trimDecimal(method.price) : ''
  initial = JSON.stringify(state)
  open.value = true
}
const closeForm = async () => {
  if (dirty.value && !(await confirm({ title: 'Discard changes?', description: 'Your changes have not been saved.', confirmLabel: 'Discard', color: 'error' }))) {
    return
  }
  open.value = false
}

const saving = ref(false)
const save = async () => {
  saving.value = true
  const body = { name: state.name.trim(), price: state.price.trim() }
  try {
    if (editing.value) await api(`/api/admin/shipping-methods/${editing.value.id}`, { method: 'PATCH', body })
    else await api('/api/admin/shipping-methods', { method: 'POST', body })
    toast.add({ title: editing.value ? `Saved ${body.name}` : `Added ${body.name}`, color: 'success', icon: 'i-lucide-check' })
    initial = JSON.stringify(state)
    open.value = false
  } catch (error) {
    toast.add({ title: 'Could not save', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    saving.value = false
    await refresh()
  }
}

const remove = async (method: Method) => {
  const go = await confirm({
    title: `Delete ${method.name}?`,
    description: 'Buyers can no longer choose it. Orders that used it keep it.',
    confirmLabel: 'Delete',
    color: 'error',
  })
  if (!go) return
  try {
    await api(`/api/admin/shipping-methods/${method.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${method.name}`, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not delete', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refresh()
}

const formRef = useTemplateRef('form')
defineShortcuts({ meta_s: { usingInput: true, handler: () => { if (open.value && !saving.value) formRef.value?.submit() } } })
</script>

<template>
  <UDashboardPanel id="settings-shipping">
    <template #header>
      <UDashboardNavbar title="Shipping" icon="i-lucide-settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="New shipping method" @click="startForm(null)" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm text-muted">Buyers choose one of these at checkout; the cheapest is picked to start with.</p>
      <UTable
        :data="methods ?? []"
        :columns="columns"
        :loading="isLoading"
        empty="No shipping methods yet. Without one, checkout charges no shipping."
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="(_e: Event, row: any) => startForm(row.original)"
      >
        <template #name-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.name }}</span>
        </template>
        <template #price-cell="{ row }">{{ price(row.original) }}</template>
        <template #actions-cell="{ row }">
          <UDropdownMenu
            :items="[[{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => startForm(row.original) }], [{ label: 'Delete', icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(row.original) }]]"
            :content="{ align: 'end' }"
          >
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="`Actions for ${row.original.name}`" @click.stop />
          </UDropdownMenu>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <USlideover
    :open="open"
    :title="editing ? `Edit ${editing.name}` : 'New shipping method'"
    :dismissible="false"
    @close:prevent="closeForm"
    @update:open="(value: boolean) => !value && closeForm()"
  >
    <template #body>
      <UForm ref="form" :schema="schema" :state="state" class="space-y-4" @submit="save">
        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" placeholder="Standard delivery" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Price" name="price" required help="0 for free shipping">
          <UInput v-model="state.price" inputmode="decimal" class="w-32" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <span v-if="dirty" class="mr-auto text-xs text-muted">Unsaved changes</span>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="closeForm" />
        <UButton :loading="saving" label="Save" @click="formRef?.submit()">
          <template #trailing>
            <UKbd value="meta" size="sm" /><UKbd value="s" size="sm" />
          </template>
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
