<script setup lang="ts">
// A value in a table cell that turns into an input when clicked. Enter or
// leaving the input saves; Escape cancels. `save` gets the typed text, or
// null when it is emptied and `nullable`; when it fails, the input stays open.
const props = defineProps<{
  value: string | number | null
  // Shown when not editing
  display: string
  label: string
  kind: 'money' | 'integer'
  nullable?: boolean
  save: (value: string | null) => Promise<void>
}>()

const editing = ref(false)
const text = ref('')
const saving = ref(false)
const invalid = ref(false)
const input = useTemplateRef('input')

const pattern = { money: /^\d+(\.\d+)?$/, integer: /^\d+$/ }

// The text to edit, prices without the database's trailing zeros
const initial = () => trimDecimal(props.value)

const start = async () => {
  text.value = initial()
  invalid.value = false
  editing.value = true
  await nextTick()
  input.value?.inputRef?.select()
}

const commit = async () => {
  if (!editing.value || saving.value) return
  const value = text.value.trim()
  if (value === initial()) {
    editing.value = false
    return
  }
  if (value === '' ? !props.nullable : !pattern[props.kind].test(value)) {
    invalid.value = true
    return
  }
  saving.value = true
  try {
    await props.save(value === '' ? null : value)
    editing.value = false
  } catch {
    invalid.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UInput
    v-if="editing"
    ref="input"
    v-model="text"
    :aria-label="label"
    :color="invalid ? 'error' : 'primary'"
    :highlight="invalid"
    :loading="saving"
    inputmode="decimal"
    :class="kind === 'money' ? 'w-24' : 'w-20'"
    @click.stop
    @keydown.enter.prevent="commit"
    @keydown.esc.stop.prevent="editing = false"
    @blur="commit"
  />
  <button
    v-else
    type="button"
    :aria-label="label"
    class="-mx-1.5 rounded px-1.5 py-0.5 tabular-nums hover:bg-elevated hover:ring hover:ring-default active:bg-accented"
    :class="{ 'text-dimmed': !display }"
    @click.stop="start"
  >
    {{ display || '–' }}
  </button>
</template>
