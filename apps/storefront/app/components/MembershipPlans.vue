<script setup lang="ts">
// Membership plans to join, grouped by program (they come in program order),
// a card each. `signInTo`: for a guest, where Sign in goes.
type ToJoin = {
  plan: { id: number; name: string; program: string; description: string | null }
  replaces: { id: number; name: string } | null
  terms: { id: number; variantId: number; months: number; price: string | null }[]
}
const props = defineProps<{ options: ToJoin[]; signInTo?: string }>()
const programs = computed(() => {
  const groups = new Map<string, ToJoin[]>()
  for (const option of props.options) groups.set(option.plan.program, [...(groups.get(option.plan.program) ?? []), option])
  return [...groups]
})
</script>

<template>
  <div class="space-y-6">
    <div v-for="[program, plans] in programs" :key="program" class="space-y-3">
      <h3 class="font-sans text-xs font-medium tracking-wider text-muted uppercase">{{ program }}</h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AccountJoinPlanCard v-for="option in plans" :key="option.plan.id" :option="option" :sign-in-to="signInTo" class="rounded-sm bg-muted p-6" />
      </div>
    </div>
  </div>
</template>
