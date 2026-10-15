<script setup lang="ts">
// Chosen customers, and a search by email to add more
const chosen = defineModel<{ id: string; email: string }[]>({ required: true })

const searchTerm = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (q.value = value.trim()), 250)
})
const { data } = useQuery({
  key: () => ['users', 'offer-search', q.value],
  query: () => $fetch('/api/admin/users', { query: { q: q.value || undefined, size: 20 } }),
})
const choices = computed(() =>
  (data.value?.results ?? [])
    .filter((user) => !chosen.value.some((c) => c.id === user.id))
    .map((user) => ({ label: user.email, value: user.id })),
)
const add = (id: string | undefined) => {
  const choice = choices.value.find((c) => c.value === id)
  if (choice) chosen.value = [...chosen.value, { id: choice.value, email: choice.label }]
}
</script>

<template>
  <div class="space-y-2">
    <ul v-if="chosen.length" class="divide-y divide-default rounded-md border border-default">
      <li v-for="user in chosen" :key="user.id" class="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
        <span class="flex-1 truncate">{{ user.email }}</span>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove ${user.email}`" @click="chosen = chosen.filter((c) => c.id !== user.id)" />
      </li>
    </ul>
    <USelectMenu
      v-model:search-term="searchTerm"
      :model-value="undefined"
      :items="choices"
      value-key="value"
      ignore-filter
      placeholder="Add a customer"
      aria-label="Add a customer"
      icon="i-lucide-plus"
      class="w-64"
      @update:model-value="add"
    />
  </div>
</template>
