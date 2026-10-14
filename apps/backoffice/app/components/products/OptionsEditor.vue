<script setup lang="ts">
// Options such as Size and Colour with their values. "Generate variants"
// asks for a variant for every combination the product does not have yet.
const props = defineProps<{
  // The product's options, to start from
  options: { name: string; values: { value: string }[] }[]
  // Generating needs a saved product
  disabled?: boolean
  loading?: boolean
}>()
const emit = defineEmits<{ generate: [options: Record<string, string[]>] }>()

type Row = { name: string; values: string[] }
const rows = ref<Row[]>([])
const reset = () => {
  rows.value = props.options.length
    ? props.options.map((option) => ({ name: option.name, values: option.values.map((v) => v.value) }))
    : [{ name: '', values: [] }]
}
watch(() => props.options, reset, { immediate: true, deep: true })

const filled = computed(() => rows.value.filter((row) => row.name.trim() && row.values.length))
const combinations = computed(() => (filled.value.length ? filled.value.reduce((total, row) => total * row.values.length, 1) : 0))
// The API makes at most this many at once
const maxCombinations = 100

const generate = () => emit('generate', Object.fromEntries(filled.value.map((row) => [row.name.trim(), row.values])))
</script>

<template>
  <div class="space-y-2">
    <div v-for="(row, index) in rows" :key="index" class="flex items-start gap-2">
      <UInput v-model="row.name" placeholder="Size" aria-label="Option name" class="w-36 shrink-0" :disabled="disabled" />
      <UInputTags v-model="row.values" placeholder="Type a value, then Enter" aria-label="Values" class="flex-1" :disabled="disabled" add-on-blur />
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Remove option"
        :disabled="disabled || rows.length === 1"
        @click="rows.splice(index, 1)"
      />
    </div>
    <div class="flex items-center gap-2">
      <UButton icon="i-lucide-plus" color="neutral" variant="ghost" label="Add option" :disabled="disabled" @click="rows.push({ name: '', values: [] })" />
      <span class="ml-auto text-xs text-muted">
        <template v-if="disabled">Save the product first</template>
        <template v-else-if="combinations > maxCombinations">{{ combinations }} combinations, at most {{ maxCombinations }}</template>
        <template v-else-if="combinations">{{ combinations }} combinations; existing ones are kept</template>
      </span>
      <UButton
        icon="i-lucide-sparkles"
        label="Generate variants"
        color="neutral"
        variant="outline"
        :loading="loading"
        :disabled="disabled || !combinations || combinations > maxCombinations"
        @click="generate"
      />
    </div>
  </div>
</template>
