<script setup lang="ts">
// A category's products, its subcategories' included, with links to the
// subcategories
const route = useRoute()
const { data: categories } = await useCategories()
const category = computed(() => categories.value?.find((c) => c.slug === route.params.slug))
if (!category.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}
const children = computed(() => (categories.value ?? []).filter((c) => c.parentId === category.value?.id))

useSeoMeta({
  title: () => category.value?.name,
  description: () => category.value?.description || undefined,
})
</script>

<template>
  <ProductListing
    v-if="category"
    :key="category.id"
    :title="category.name"
    :description="category.description"
    :base="{ categories: category.id }"
    brand-filter
  >
    <template #intro>
      <nav v-if="category.parent || children.length" aria-label="Subcategories" class="flex flex-wrap gap-2 pt-2">
        <UButton
          v-if="category.parent"
          :to="`/categories/${category.parent.slug}`"
          :label="category.parent.name"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="outline"
          size="sm"
        />
        <UButton v-for="child in children" :key="child.id" :to="`/categories/${child.slug}`" :label="child.name" color="neutral" variant="outline" size="sm" />
      </nav>
    </template>
  </ProductListing>
</template>
