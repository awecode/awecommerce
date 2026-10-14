<script setup lang="ts">
// The home page. The product sections (shop by category, featured, best
// sellers) come with the listings.
const { store } = useAppConfig()
useSeoMeta({ description: store.description })
</script>

<template>
  <HomeHero />
</template>
