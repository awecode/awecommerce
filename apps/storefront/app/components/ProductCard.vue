<script setup lang="ts">
// A product in a grid: image, name, brand and price, marked when sold out
export type CardProduct = {
  id: number
  slug: string
  name: string
  thumbnail: string | null
  minPrice: string | null
  maxPrice: string | null
  inStock: boolean
  singleVariant: { price: string | null; discountedPrice: string | null } | null
  brand: { name: string } | null
}
const props = defineProps<{ product: CardProduct }>()
const range = computed(() => props.product.minPrice !== props.product.maxPrice)
</script>

<template>
  <NuxtLink :to="`/products/${product.slug}`" class="group block transition-opacity active:opacity-75" data-product-card>
    <div class="relative aspect-4/5 overflow-hidden rounded-sm bg-elevated">
      <AppImage
        v-if="product.thumbnail"
        :src="product.thumbnail"
        :alt="product.name"
        :width="800"
        :height="1000"
        class="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      <UIcon v-else name="i-lucide-image" class="absolute inset-0 m-auto size-8 text-dimmed" />
      <UBadge v-if="!product.inStock" label="Sold out" color="neutral" variant="solid" class="absolute top-3 left-3" />
    </div>
    <div class="mt-3 space-y-1">
      <p v-if="product.brand?.name" class="text-xs tracking-wider text-muted uppercase">{{ product.brand.name }}</p>
      <h3 class="font-sans text-sm font-normal text-default group-hover:underline">{{ product.name }}</h3>
      <PriceTag
        v-if="product.singleVariant"
        :price="product.singleVariant.price"
        :sale="product.singleVariant.discountedPrice"
      />
      <PriceTag v-else :price="product.minPrice" :from="range" />
    </div>
  </NuxtLink>
</template>
