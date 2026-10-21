<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type Brand = CatalogRow & { order: number | null; logo: string | null; description: string | null }

useSeoMeta({ title: 'Brands' })

const columns: TableColumn<Brand>[] = [
  { accessorKey: 'order', header: 'Order', meta: { class: { th: 'w-20', td: 'tabular-nums text-muted' } } },
]

const toast = useToast()
const pendingLogo = ref<File | null>(null)

const uploadLogoIfNeeded = async (state: Record<string, any>) => {
  if (!pendingLogo.value) return true
  const slug = String(state.slug || '').trim()
  if (!isStorageSlug(slug)) {
    toast.add({
      title: 'Check the slug',
      description: 'Logos are stored under the slug: use lowercase letters, numbers and hyphens',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
    return false
  }
  try {
    const { url } = await uploadAdminImage(pendingLogo.value, { folder: 'brands', slug })
    state.logo = url
    pendingLogo.value = null
    return true
  } catch (error) {
    toast.add({ title: 'Could not upload logo', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
}
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
    :pending-changes="Boolean(pendingLogo)"
    :before-save="uploadLogoIfNeeded"
    :on-form-reset="() => { pendingLogo = null }"
  >
    <template #fields="form">
      <UFormField label="Menu order" name="order" help="Lowest first">
        <UInputNumber v-model="form.state.order" :min="0" class="w-32" />
      </UFormField>
      <UFormField label="Logo" name="logo" help="Upload a file, or paste a public URL">
        <CatalogLogoField v-model:logo="form.state.logo" v-model:pending="pendingLogo" />
      </UFormField>
      <UFormField label="Description" name="description">
        <UTextarea v-model="form.state.description" :rows="3" autoresize class="w-full" />
      </UFormField>
    </template>
  </CatalogPage>
</template>
