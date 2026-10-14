<script setup lang="ts">
// A price in the store's currency: the sale price with the regular one struck
// through, or "From" the lowest of a range
const props = defineProps<{
  price: string | null
  sale?: string | null
  from?: boolean
}>()
const money = useMoney()
const onSale = computed(() => props.sale && props.price && Number(props.sale) < Number(props.price))
</script>

<template>
  <span class="inline-flex items-baseline gap-2 font-serif">
    <span v-if="from" class="font-sans text-sm text-muted">From</span>
    <span :class="{ 'text-error': onSale }">{{ money(onSale ? sale : (sale || price)) }}</span>
    <s v-if="onSale" class="text-sm text-muted">{{ money(price) }}</s>
  </span>
</template>
