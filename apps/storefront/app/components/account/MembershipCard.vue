<script setup lang="ts">
// A plan the buyer holds, waits for, or held until recently, with a Renew
// button per term on sale: it goes in the cart and the cart drawer opens.
type Current = {
  plan: { id: number; name: string; program: string }
  state: 'active' | 'upcoming' | 'ended'
  startsAt: string
  endsAt: string
  terms: { id: number; variantId: number; months: number; price: string | null }[]
}
const props = defineProps<{ membership: Current }>()
const money = useMoney()
const toast = useToast()
const { add, drawerOpen } = useCart()
const settings = useStoreSettings()
const day = (value: string) => new Intl.DateTimeFormat(settings.value?.locale ?? 'en-US', { dateStyle: 'long' }).format(new Date(value))

const status = computed(() => {
  const { state, startsAt, endsAt } = props.membership
  if (state === 'active') return `Active until ${day(endsAt)}`
  if (state === 'upcoming') return `Starts ${day(startsAt)}, until ${day(endsAt)}`
  return `Ended on ${day(endsAt)}`
})

const adding = ref<number | null>(null)
const renew = async (term: Current['terms'][number]) => {
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
  <div class="space-y-3" :aria-label="`${membership.plan.name} membership`" role="group">
    <div>
      <p class="font-medium">{{ membership.plan.name }}</p>
      <p class="text-sm text-muted">{{ status }}</p>
    </div>
    <div v-if="membership.terms.length" class="space-y-2">
      <p class="text-xs text-muted">
        {{ membership.state === 'ended' ? 'Renewing starts it again today.' : `Renewing adds time after ${day(membership.endsAt)}.` }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="term in membership.terms"
          :key="term.id"
          :label="`Renew ${months(term.months)}${term.price ? ` · ${money(term.price)}` : ''}`"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="adding === term.id"
          @click="renew(term)"
        />
      </div>
    </div>
  </div>
</template>
