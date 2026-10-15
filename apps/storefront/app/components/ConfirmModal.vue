<script setup lang="ts">
// A yes/no question; closes with true or false. Opened through useConfirm().
withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  color?: 'primary' | 'error' | 'neutral'
}>(), { confirmLabel: 'Confirm', color: 'primary' })

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal :title="title" :description="description" :ui="{ footer: 'justify-end' }" @update:open="(open: boolean) => !open && emit('close', false)">
    <template #footer>
      <UButton color="neutral" variant="ghost" label="Cancel" @click="emit('close', false)" />
      <UButton :color="color" :label="confirmLabel" autofocus @click="emit('close', true)" />
    </template>
  </UModal>
</template>
