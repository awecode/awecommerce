<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// The product's options, such as Size and Colour. Saved options and values
// can be renamed or deleted from their menus; new values and new options are
// added below them, and "Generate variants" asks for a variant for every
// combination the product does not have yet.
type Option = { id: number; name: string; values: { id: number; value: string }[] }
const props = defineProps<{
  options: Option[]
  // The saved variants, to tell how many use a value
  variants: Pick<VariantRow, 'options'>[]
  // Changing options needs a saved product
  disabled?: boolean
  loading?: boolean
}>()
const emit = defineEmits<{
  generate: [options: Record<string, string[]>]
  renameOption: [id: number, name: string]
  deleteOption: [id: number]
  renameValue: [id: number, value: string]
  deleteValue: [id: number]
}>()

const confirm = useConfirm()
const prompt = usePrompt()

// New values for saved options, by option name, and whole new options
const added = ref<Record<string, string[]>>({})
const newRows = ref<{ name: string; values: string[] }[]>([])
const reset = () => {
  added.value = Object.fromEntries(props.options.map((option) => [option.name, []]))
  newRows.value = props.options.length ? [] : [{ name: '', values: [] }]
}
watch(() => props.options, reset, { immediate: true, deep: true })

const wanted = computed(() => [
  ...props.options.map((option) => ({
    name: option.name,
    values: [...option.values.map((v) => v.value), ...(added.value[option.name] ?? [])],
  })),
  ...newRows.value.filter((row) => row.name.trim() && row.values.length).map((row) => ({ name: row.name.trim(), values: row.values })),
].filter((row) => row.values.length))
const combinations = computed(() => (wanted.value.length ? wanted.value.reduce((total, row) => total * row.values.length, 1) : 0))
// The API makes at most this many at once
const maxCombinations = 100
const generate = () => emit('generate', Object.fromEntries(wanted.value.map((row) => [row.name, row.values])))

const using = (option: Option, value: string) =>
  props.variants.filter((variant) => variant.options.some((o) => o.name === option.name && o.value === value)).length
const valuesInUse = (option: Option) => option.values.filter((v) => using(option, v.value) > 0).length
const plural = (count: number) => `${count} variant${count === 1 ? '' : 's'}`

const optionMenu = (option: Option): DropdownMenuItem[] => [
  {
    label: 'Rename',
    icon: 'i-lucide-pencil',
    onSelect: async () => {
      const name = await prompt({ title: `Rename ${option.name}`, label: 'Option name', value: option.name })
      if (name && name !== option.name) emit('renameOption', option.id, name)
    },
  },
  valuesInUse(option) > 1
    ? { label: 'Delete', icon: 'i-lucide-trash', disabled: true, description: 'Delete its values until one is left' }
    : {
        label: 'Delete',
        icon: 'i-lucide-trash',
        color: 'error',
        onSelect: async () => {
          const go = await confirm({ title: `Delete ${option.name}?`, description: 'It is removed from every variant.', confirmLabel: 'Delete', color: 'error' })
          if (go) emit('deleteOption', option.id)
        },
      },
]

const valueMenu = (option: Option, value: Option['values'][number]): DropdownMenuItem[] => {
  const count = using(option, value.value)
  return [
    {
      label: 'Rename',
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        const text = await prompt({ title: `Rename ${value.value}`, label: option.name, value: value.value })
        if (text && text !== value.value) emit('renameValue', value.id, text)
      },
    },
    count && count >= props.variants.length
      ? { label: 'Delete', icon: 'i-lucide-trash', disabled: true, description: 'Every variant has it; delete the option instead' }
      : {
          label: 'Delete',
          icon: 'i-lucide-trash',
          color: 'error',
          onSelect: async () => {
            const go = await confirm({
              title: `Delete ${value.value}?`,
              description: count ? `This deletes the ${plural(count)} with ${value.value}.` : 'No variant has it.',
              confirmLabel: 'Delete',
              color: 'error',
            })
            if (go) emit('deleteValue', value.id)
          },
        },
  ]
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="option in options" :key="option.id" class="flex items-start gap-2">
      <UDropdownMenu :items="optionMenu(option)" :disabled="disabled">
        <UButton :label="option.name" color="neutral" variant="soft" trailing-icon="i-lucide-chevron-down" :aria-label="`${option.name} option`" class="w-36 shrink-0 justify-between" />
      </UDropdownMenu>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <UDropdownMenu v-for="value in option.values" :key="value.id" :items="valueMenu(option, value)" :disabled="disabled">
          <UButton :label="value.value" color="neutral" variant="outline" size="xs" :aria-label="`${option.name}: ${value.value}`" />
        </UDropdownMenu>
        <UInputTags v-model="added[option.name]" placeholder="Add values" :aria-label="`New values of ${option.name}`" class="min-w-40 flex-1" :disabled="disabled" add-on-blur />
      </div>
    </div>

    <div v-for="(row, index) in newRows" :key="`new-${index}`" class="flex items-start gap-2">
      <UInput v-model="row.name" placeholder="Size" aria-label="Option name" class="w-36 shrink-0" :disabled="disabled" />
      <UInputTags v-model="row.values" placeholder="Type a value, then Enter" aria-label="Values" class="flex-1" :disabled="disabled" add-on-blur />
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove option" :disabled="disabled" @click="newRows.splice(index, 1)" />
    </div>

    <div class="flex items-center gap-2">
      <UButton icon="i-lucide-plus" color="neutral" variant="ghost" label="Add option" :disabled="disabled" @click="newRows.push({ name: '', values: [] })" />
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
