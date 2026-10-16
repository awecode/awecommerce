<script setup lang="ts">
// The product variants that sell a plan, each for some months. Adding and
// removing save at once; the plan form's Save also adds a picked variant
// (`addPicked`), and a picked one counts as unsaved (`pending`).
const props = defineProps<{ planId: number }>()

const toast = useToast()
const confirm = useConfirm()
const money = useMoney()
const queryCache = useQueryCache()
// Paths with an id are only known at run time
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

type Term = { id: number; months: number; variant: { id: number; sku: string; title: string | null; price: string | null; product: { id: number; name: string } } }
const { data: plan } = useQuery({
  key: () => ['membership-plans', props.planId],
  query: () => api<{ terms: Term[] }>(`/api/admin/membership-plans/${props.planId}`),
})
const refresh = () => queryCache.invalidateQueries({ key: ['membership-plans'] })

// ---- choosing a product, then its variant
const searchTerm = ref('')
const q = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (q.value = value.trim()), 250)
})
const { data: found } = useQuery({
  key: () => ['products', 'term-search', q.value],
  query: () => apiGet('/api/admin/products', { query: { q: q.value || undefined, size: 20 } }),
})
const productItems = computed(() => (found.value?.results ?? []).map((product) => ({ label: product.name, value: product.id })))
const productId = ref<number | undefined>()
const { data: product } = useQuery({
  key: () => ['products', productId.value ?? 0],
  query: () => api<{ variants: { id: number; sku: string; title: string | null }[] }>(`/api/admin/products/${productId.value}`),
  enabled: () => productId.value !== undefined,
})
const taken = computed(() => new Set((plan.value?.terms ?? []).map((term) => term.variant.id)))
const variantItems = computed(() =>
  (product.value?.variants ?? []).map((v) => ({ label: [v.title, v.sku].filter(Boolean).join(' · '), value: v.id, disabled: taken.value.has(v.id) })),
)
const variantId = ref<number | undefined>()
watch(productId, () => (variantId.value = variantItems.value.length === 1 ? variantItems.value[0]!.value : undefined))
watch(variantItems, (items) => {
  if (items.length === 1 && !items[0]!.disabled) variantId.value = items[0]!.value
})
const months = ref(12)

const adding = ref(false)
// Adds the picked variant; false when it could not
const add = async () => {
  if (!variantId.value) return true
  adding.value = true
  try {
    await api(`/api/admin/membership-plans/${props.planId}/terms`, { method: 'POST', body: { variantId: variantId.value, months: months.value } })
    toast.add({ title: 'Term added', color: 'success', icon: 'i-lucide-check' })
    productId.value = undefined
    variantId.value = undefined
    return true
  } catch (error) {
    toast.add({ title: 'Could not add it', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  } finally {
    adding.value = false
    await refresh()
  }
}
defineExpose({ pending: computed(() => variantId.value !== undefined), addPicked: add })

const remove = async (term: Term) => {
  const go = await confirm({
    title: `Stop selling through ${term.variant.sku}?`,
    description: 'The variant no longer grants the plan. Memberships already bought stay.',
    confirmLabel: 'Remove',
    color: 'error',
  })
  if (!go) return
  try {
    await api(`/api/admin/membership-terms/${term.id}`, { method: 'DELETE' })
  } catch (error) {
    toast.add({ title: 'Could not remove it', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  await refresh()
}
const monthsLabel = (n: number) => `${n} month${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="space-y-2">
    <ul v-if="plan?.terms.length" class="divide-y divide-default rounded-md border border-default">
      <li v-for="term in plan.terms" :key="term.id" class="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
        <div class="min-w-0 flex-1">
          <NuxtLink :to="`/products/${term.variant.product.id}`" class="truncate hover:underline">{{ term.variant.product.name }}</NuxtLink>
          <p class="truncate text-xs text-muted">{{ [term.variant.title, term.variant.sku].filter(Boolean).join(' · ') }}</p>
        </div>
        <span class="text-muted">{{ monthsLabel(term.months) }}</span>
        <span class="w-20 text-right tabular-nums">{{ term.variant.price ? money(term.variant.price) : '–' }}</span>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove ${term.variant.sku}`" @click="remove(term)" />
      </li>
    </ul>
    <p v-else class="text-sm text-muted">Not sold yet: staff can still grant it.</p>
    <div class="flex flex-wrap items-center gap-2">
      <USelectMenu
        v-model="productId"
        v-model:search-term="searchTerm"
        :items="productItems"
        value-key="value"
        ignore-filter
        placeholder="Product"
        aria-label="Product"
        class="w-48"
      />
      <USelect v-model="variantId" :items="variantItems" placeholder="Variant" aria-label="Variant" class="w-40" :disabled="!productId" />
      <UInputNumber v-model="months" :min="1" :max="120" aria-label="Months" class="w-28" />
      <UButton label="Add" color="neutral" variant="outline" :loading="adding" :disabled="!variantId" @click="add" />
    </div>
  </div>
</template>
