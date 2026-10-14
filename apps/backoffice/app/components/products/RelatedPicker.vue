<script setup lang="ts">
// Related products: the chosen ones, and a search to add more
const related = defineModel<{ id: number; name: string }[]>({ required: true })
const props = defineProps<{ productId: number | null }>()

const searchTerm = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (q.value = value.trim()), 250)
})
const { data } = useQuery({
  key: () => ['products', 'related-search', q.value],
  query: () => $fetch('/api/admin/products', { query: { q: q.value || undefined, size: 20 } }),
})
const choices = computed(() =>
  (data.value?.results ?? [])
    .filter((product) => product.id !== props.productId && !related.value.some((r) => r.id === product.id))
    .map((product) => ({ label: product.name, value: product.id })),
)
const add = (id: number | undefined) => {
  const choice = choices.value.find((c) => c.value === id)
  if (choice) related.value = [...related.value, { id: choice.value, name: choice.label }]
}
</script>

<template>
  <div class="space-y-2">
    <ul v-if="related.length" class="divide-y divide-default rounded-md border border-default">
      <li v-for="product in related" :key="product.id" class="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
        <NuxtLink :to="`/products/${product.id}`" class="flex-1 truncate hover:underline">{{ product.name }}</NuxtLink>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove ${product.name}`" @click="related = related.filter((r) => r.id !== product.id)" />
      </li>
    </ul>
    <USelectMenu
      v-model:search-term="searchTerm"
      :model-value="undefined"
      :items="choices"
      value-key="value"
      ignore-filter
      placeholder="Add a related product"
      icon="i-lucide-plus"
      class="w-64"
      @update:model-value="add"
    />
  </div>
</template>
