<script setup lang="ts">
import { z } from 'zod'

// Asks why the order is cancelled; closes with the reason and remarks, or null.
// Opened through useOverlay().
defineProps<{ orderId: number }>()
const emit = defineEmits<{ close: [value: { reason: string; remarks?: string } | null] }>()

const state = reactive({ reason: '', remarks: '' })
const schema = z.object({ reason: z.string().trim().min(1, 'Enter a reason') })
const submit = () => emit('close', { reason: state.reason.trim(), remarks: state.remarks.trim() || undefined })
</script>

<template>
  <UModal :title="`Cancel order #${orderId}?`" description="Its offer uses and redeemed points are given back, and so is the stock it took." @update:open="(open: boolean) => !open && emit('close', null)">
    <template #body>
      <UForm id="cancel-order" :schema="schema" :state="state" class="space-y-4" @submit="submit">
        <UFormField label="Reason" name="reason" required>
          <UInput v-model="state.reason" placeholder="Out of stock" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Remarks" name="remarks" hint="Optional">
          <UTextarea v-model="state.remarks" :rows="2" autoresize class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Keep order" color="neutral" variant="ghost" @click="emit('close', null)" />
        <UButton type="submit" form="cancel-order" label="Cancel order" color="error" />
      </div>
    </template>
  </UModal>
</template>
