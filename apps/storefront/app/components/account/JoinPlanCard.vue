<script setup lang="ts">
// A plan the buyer can join, with a Join button per term on sale (Upgrade,
// when it replaces the plan they hold): it goes in the cart and the buyer goes
// straight to checkout. For a guest (`signInTo`, the sign-in link), the terms
// and a Sign in button instead.
type ToJoin = {
  plan: { id: number; name: string; program: string; description: string | null }
  replaces: { id: number; name: string } | null
  terms: { id: number; variantId: number; months: number; price: string | null }[]
}
defineProps<{ option: ToJoin; signInTo?: string }>()
const money = useMoney()
const toast = useToast()
const { add } = useCart()

const adding = ref<number | null>(null)
const join = async (term: ToJoin['terms'][number]) => {
  adding.value = term.id
  try {
    await add(term.variantId, 1)
  } catch (error) {
    toast.add({ title: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    adding.value = null
    return
  }
  await navigateTo('/checkout')
}
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="space-y-3" :aria-label="`Join ${option.plan.name}`" role="group">
    <div>
      <p class="font-medium">{{ option.plan.name }}</p>
      <!-- Rich text, written by staff in the backoffice -->
      <div v-if="option.plan.description" class="rich-text mt-2 text-sm text-muted" v-html="option.plan.description" />
    </div>
    <div class="space-y-2">
      <p v-if="option.replaces" class="text-xs text-muted">Starts today and replaces your {{ option.replaces.name }} membership.</p>
      <template v-if="signInTo">
        <p class="text-sm">{{ option.terms.map((term) => `${months(term.months)}${term.price ? ` · ${money(term.price)}` : ''}`).join(', ') }}</p>
        <UButton :to="signInTo" label="Sign in to join" color="neutral" variant="outline" size="sm" />
      </template>
      <div v-else class="flex flex-wrap gap-2">
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
