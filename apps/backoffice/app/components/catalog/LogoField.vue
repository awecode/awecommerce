<script setup lang="ts">
// Logo URL plus optional file upload. The parent uploads on save (folder +
// slug) via beforeSave; pending files count as unsaved through pendingChanges.
const logo = defineModel<string | null | undefined>('logo', { required: true })
const pending = defineModel<File | null>('pending', { required: true })

const input = useTemplateRef('input')
const toast = useToast()
const objectUrl = ref<string | null>(null)

watch(pending, (file) => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = file ? URL.createObjectURL(file) : null
}, { immediate: true })
onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

const preview = computed(() => objectUrl.value || logo.value || null)

const choose = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.add({ title: `${file.name}: images must be JPEG, PNG or WebP`, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  pending.value = file
}
const clear = () => {
  pending.value = null
  logo.value = null
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="preview" class="flex items-center gap-3">
      <img :src="preview" alt="" class="size-14 rounded border border-default object-contain bg-elevated">
      <div class="min-w-0 flex-1 space-y-1">
        <p v-if="pending" class="text-xs text-muted">Not uploaded yet</p>
        <UButton color="neutral" variant="ghost" size="xs" label="Remove" @click="clear" />
      </div>
    </div>
    <div class="flex gap-2">
      <UInput
        :model-value="logo ?? ''"
        type="url"
        placeholder="https://example.com/logo.png"
        class="w-full"
        :disabled="Boolean(pending)"
        @update:model-value="(value: string) => { logo = value || null }"
      />
      <UButton color="neutral" variant="outline" icon="i-lucide-upload" aria-label="Upload logo" @click="input?.click()" />
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="choose">
    </div>
  </div>
</template>
