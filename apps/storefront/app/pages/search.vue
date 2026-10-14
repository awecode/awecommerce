<script setup lang="ts">
// Search results for `q`, or every product without one
const route = useRoute()
const q = computed(() => ((route.query.q as string | undefined) ?? '').trim())
const title = computed(() => (q.value ? `Results for “${q.value}”` : 'All products'))

useSeoMeta({ title, robots: 'noindex, follow' })
</script>

<template>
  <ProductListing :key="q" :title="title" :base="{ q: q || undefined }" brand-filter />
</template>
