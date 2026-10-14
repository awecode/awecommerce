<script setup lang="ts">
import type { CardProduct } from './ProductCard.vue'

// A titled row of products on the home page, with a link to see more
defineProps<{ title: string; products: CardProduct[]; more?: string }>()
const id = useId()
</script>

<template>
  <section v-if="products.length" :aria-labelledby="id" class="py-12">
    <UContainer>
      <div class="mb-8 flex items-end justify-between gap-4">
        <h2 :id="id" class="text-3xl font-medium tracking-tight">{{ title }}</h2>
        <UButton v-if="more" :to="more" label="View all" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right" />
      </div>
      <ProductGrid :products="products" />
    </UContainer>
  </section>
</template>
