<script setup lang="ts">
// An order in the account's lists: number, date, status, items and total
type Order = {
  id: number
  createdAt: string
  status: string
  total: string
  lines: { id: number; productName: string; imageUrl: string | null; quantity: number }[]
}
const props = defineProps<{ order: Order }>()
const money = useMoney()
const { data: settings } = useStoreSettings()
const date = computed(() => new Intl.DateTimeFormat(settings.value?.locale ?? 'en-US', { dateStyle: 'medium' }).format(new Date(props.order.createdAt)))
const items = computed(() => props.order.lines.reduce((total, line) => total + line.quantity, 0))
</script>

<template>
  <NuxtLink :to="`/orders/${order.id}`" class="flex items-center gap-4 py-5 transition-colors hover:bg-muted/60 active:bg-muted sm:px-3" :aria-label="`Order ${order.id}`">
    <div class="flex -space-x-3">
      <div v-for="line in order.lines.slice(0, 3)" :key="line.id" class="size-12 overflow-hidden rounded-sm bg-elevated ring-2 ring-(--ui-bg)">
        <img v-if="line.imageUrl" :src="line.imageUrl" alt="" class="size-full object-cover">
      </div>
    </div>
    <div class="min-w-0 flex-1">
      <p class="font-medium">Order {{ order.id }}</p>
      <p class="text-sm text-muted">
        {{ date }} · {{ items }} item{{ items === 1 ? '' : 's' }}<span class="sm:hidden"> · {{ order.status }}</span>
      </p>
    </div>
    <UBadge :label="order.status" color="neutral" variant="subtle" class="hidden sm:inline-flex" />
    <p class="text-right font-serif sm:w-24">{{ money(order.total) }}</p>
    <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
  </NuxtLink>
</template>
