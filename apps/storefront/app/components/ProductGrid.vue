<script setup lang="ts">
import type { CardProduct } from './ProductCard.vue'

defineProps<{ products: CardProduct[] }>()
</script>

<template>
  <ul class="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
    <li v-for="product in products" :key="product.id">
      <ProductCard :product="product" />
    </li>
  </ul>
</template>
