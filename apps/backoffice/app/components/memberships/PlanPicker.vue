<script setup lang="ts">
// Membership plans to pick from, searched on the server as you type (name,
// slug or program), so a shop with any number of plans can pick each one.
// The chosen plans are loaded by id, so they are named even when the search
// does not show them. One plan, or several with `multiple`; `activeOnly`
// leaves inactive plans out; `clear` adds a button that empties the choice.
const props = defineProps<{ multiple?: boolean; activeOnly?: boolean; clear?: boolean }>()
const model = defineModel<number | number[] | undefined>()

const searchTerm = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (q.value = value.trim()), 250)
})
const { data: found } = useQuery({
  key: () => ['membership-plans', 'picker', q.value, Boolean(props.activeOnly)],
  query: () => apiGet('/api/admin/membership-plans', { query: { q: q.value || undefined, active: props.activeOnly || undefined, size: 20 } }),
})
const chosenIds = computed(() => (Array.isArray(model.value) ? model.value : model.value == null ? [] : [model.value]))
const { data: chosen } = useQuery({
  key: () => ['membership-plans', 'picker-chosen', chosenIds.value],
  query: () => apiGet('/api/admin/membership-plans', { query: { ids: chosenIds.value.join(','), size: 100 } }),
  enabled: () => chosenIds.value.length > 0,
})

// The search results, then any chosen plan they leave out
const items = computed(() => {
  const plans = new Map<number, { label: string; value: number }>()
  for (const plan of [...(found.value?.results ?? []), ...(chosenIds.value.length ? chosen.value?.results ?? [] : [])]) {
    plans.set(plan.id, { label: `${plan.name} (${plan.program})`, value: plan.id })
  }
  return [...plans.values()]
})
</script>

<template>
  <USelectMenu
    v-model="model as any"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    :multiple="multiple"
    :clear="clear"
    ignore-filter
  />
</template>
