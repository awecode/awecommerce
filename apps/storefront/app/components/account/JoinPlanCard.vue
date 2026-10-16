<script setup lang="ts">
// A plan the buyer can join, with a Join button per term on sale (Upgrade,
// when it replaces the plan they hold): it goes in the cart and the cart
// drawer opens.
type ToJoin = {
  plan: { id: number; name: string; program: string; description: string | null }
  replaces: { id: number; name: string } | null
  terms: { id: number; variantId: number; months: number; price: string | null }[]
}
defineProps<{ option: ToJoin }>()
const money = useMoney()
const toast = useToast()
const { add, drawerOpen } = useCart()

const adding = ref<number | null>(null)
const join = async (term: ToJoin['terms'][number]) => {
  adding.value = term.id
  try {
    await add(term.variantId, 1)
    drawerOpen.value = true
  } catch (error) {
    toast.add({ title: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    adding.value = null
  }
}
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="space-y-3" :aria-label="`Join ${option.plan.name}`" role="group">
    <div>
      <p class="font-medium">{{ option.plan.name }}</p>
      <p v-if="option.plan.description" class="text-sm text-muted">{{ option.plan.description }}</p>
    </div>
    <div class="space-y-2">
      <p v-if="option.replaces" class="text-xs text-muted">Starts today and replaces your {{ option.replaces.name }} membership.</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="term in option.terms"
          :key="term.id"
          :label="`${option.replaces ? 'Upgrade' : 'Join'} ${months(term.months)}${term.price ? ` · ${money(term.price)}` : ''}`"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="adding === term.id"
          @click="join(term)"
        />
      </div>
    </div>
  </div>
</template>
