<script setup lang="ts">
// Asks for one line of text; closes with it, or null when cancelled. Opened
// through usePrompt().
const props = withDefaults(defineProps<{
  title: string
  label: string
  value?: string
  confirmLabel?: string
}>(), { value: '', confirmLabel: 'Save' })

const emit = defineEmits<{ close: [value: string | null] }>()
const text = ref(props.value)
const submit = () => {
  if (text.value.trim()) emit('close', text.value.trim())
}
</script>

<template>
  <UModal :title="title" :ui="{ footer: 'justify-end' }" @update:open="(open: boolean) => !open && emit('close', null)">
    <template #body>
      <UFormField :label="label">
        <UInput v-model="text" autofocus class="w-full" @keydown.enter.prevent="submit" />
      </UFormField>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="emit('close', null)" />
      <UButton :label="confirmLabel" :disabled="!text.trim()" @click="submit" />
    </template>
  </UModal>
</template>
