<script setup lang="ts">
// A brand's products
const route = useRoute()
const { data: brands } = await useFetch('/api/store/brands', { key: 'brands' })
const brand = computed(() => brands.value?.find((b) => b.slug === route.params.slug))
if (!brand.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useSeoMeta({
  title: () => brand.value?.name,
  description: () => brand.value?.description || undefined,
})
</script>

<template>
  <ProductListing v-if="brand" :key="brand.id" :title="brand.name" :description="brand.description" :base="{ brands: brand.id }" />
</template>
