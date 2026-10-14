<script setup lang="ts">
// Fields the buyer fills in when adding the product to the cart, such as a
// name to engrave
const fields = defineModel<CustomField[]>({ required: true })
</script>

<template>
  <div class="space-y-2">
    <div v-if="fields.length" class="flex gap-2 text-xs text-muted">
      <span class="flex-1">Label</span>
      <span class="w-28">Most characters</span>
      <span class="w-32" />
    </div>
    <div v-for="(field, index) in fields" :key="index" class="flex items-start gap-2">
      <UFormField :name="`customFields.${index}.label`" class="flex-1">
        <UInput v-model="field.label" placeholder="Name to engrave" aria-label="Field label" class="w-full" />
      </UFormField>
      <UFormField :name="`customFields.${index}.maxLength`">
        <UInputNumber v-model="field.maxLength" :min="1" aria-label="Most characters" class="w-28" />
      </UFormField>
      <USwitch v-model="field.required" label="Required" class="pt-1.5" />
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove field" @click="fields.splice(index, 1)" />
    </div>
    <UButton icon="i-lucide-plus" color="neutral" variant="ghost" label="Add field" @click="fields.push({ label: '', required: false, maxLength: 50 })" />
  </div>
</template>
