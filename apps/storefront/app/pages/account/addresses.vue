<script setup lang="ts">
// The buyer's saved addresses: add, edit, make one the default, delete
definePageMeta({ auth: true })
useSeoMeta({ title: 'Your addresses', robots: 'noindex' })

const toast = useToast()
const confirm = useConfirm()
const { data: addresses, refresh } = await useFetch('/api/store/addresses', { key: 'addresses' })
type Address = NonNullable<typeof addresses.value>[number]

// Paths with an id are only known at run time
const api = $fetch as (url: string, options?: Record<string, unknown>) => Promise<unknown>
const failed = (error: unknown) => toast.add({ title: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })

// ---- the form, for a new address or one being edited
const open = ref(false)
const editing = ref<Address | null>(null)
const state = reactive({ address: emptyAddress(), isDefault: false })
const saving = ref(false)

const startForm = (address: Address | null) => {
  editing.value = address
  state.address = address
    ? { ...emptyAddress(), ...Object.fromEntries(Object.keys(emptyAddress()).map((k) => [k, (address as Record<string, unknown>)[k] ?? ''])) }
    : emptyAddress()
  state.isDefault = address ? Boolean(address.isDefault) : !addresses.value?.length
  open.value = true
}

const save = async () => {
  saving.value = true
  try {
    // Emptied optional fields are cleared on the saved address
    const body = { ...Object.fromEntries(Object.keys(emptyAddress()).map((k) => [k, ''])), ...addressBody(state.address), isDefault: state.isDefault }
    if (editing.value) await api(`/api/store/addresses/${editing.value.id}`, { method: 'PATCH', body })
    else await api('/api/store/addresses', { method: 'POST', body: { ...addressBody(state.address), isDefault: state.isDefault } })
    open.value = false
    await refresh()
    toast.add({ title: editing.value ? 'Address saved' : 'Address added', icon: 'i-lucide-check' })
  } catch (error) {
    failed(error)
  } finally {
    saving.value = false
  }
}

const makeDefault = async (address: Address) => {
  try {
    await api(`/api/store/addresses/${address.id}`, { method: 'PATCH', body: { isDefault: true } })
    await refresh()
  } catch (error) {
    failed(error)
  }
}

const remove = async (address: Address) => {
  if (!(await confirm({ title: 'Delete this address?', description: addressLine(address), confirmLabel: 'Delete', color: 'error' }))) return
  try {
    await api(`/api/store/addresses/${address.id}`, { method: 'DELETE' })
    await refresh()
  } catch (error) {
    failed(error)
  }
}
</script>

<template>
  <AccountShell title="Your addresses">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="address in addresses" :key="address.id" class="flex flex-col gap-3 rounded-sm border border-default p-5" :aria-label="addressLine(address)">
        <UBadge v-if="address.isDefault" label="Default" color="neutral" variant="solid" class="self-start" />
        <div class="flex-1">
          <p>{{ address.line1 }}</p>
          <p v-if="address.line2">{{ address.line2 }}</p>
          <p>{{ [address.city, address.province, address.postalCode].filter(Boolean).join(', ') }}</p>
          <p>{{ address.country }}</p>
          <p v-if="address.instructions" class="mt-1 text-sm text-muted">{{ address.instructions }}</p>
        </div>
        <div class="flex flex-wrap gap-x-4">
          <UButton label="Edit" color="neutral" variant="link" class="px-0" @click="startForm(address)" />
          <UButton v-if="!address.isDefault" label="Make default" color="neutral" variant="link" class="px-0" @click="makeDefault(address)" />
          <UButton label="Delete" color="neutral" variant="link" class="px-0" @click="remove(address)" />
        </div>
      </article>
      <button
        type="button"
        class="flex min-h-40 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-default text-muted hover:border-(--ui-primary) hover:text-default"
        @click="startForm(null)"
      >
        <UIcon name="i-lucide-plus" class="size-5" />
        Add an address
      </button>
    </div>

    <UModal v-model:open="open" :title="editing ? 'Edit address' : 'New address'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UForm id="address-form" :state="state" :validate="() => addressErrors(state.address)" :validate-on="[]" @submit="save">
          <AddressFields v-model="state.address">
            <UCheckbox v-model="state.isDefault" label="Use as my default address" class="sm:col-span-2" />
          </AddressFields>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
          <UButton type="submit" form="address-form" :loading="saving" label="Save address" />
        </div>
      </template>
    </UModal>
  </AccountShell>
</template>
