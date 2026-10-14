<script setup lang="ts">
// SEO defaults for every page; pages set their own title and description
const { store } = useAppConfig()
const { data: settings } = await useStoreSettings()
const route = useRoute()
const siteUrl = (useRuntimeConfig().public.siteUrl || useRequestURL().origin).replace(/\/$/, '')
const storeName = computed(() => settings.value?.name || 'Store')

useHead({
  htmlAttrs: { lang: () => settings.value?.locale ?? 'en-US' },
  titleTemplate: (title) => (title ? `${title} · ${storeName.value}` : storeName.value),
  // The page without its query, so filtered and sorted views count as one
  link: [{ rel: 'canonical', href: () => `${siteUrl}${route.path}` }],
})
useSeoMeta({
  description: store.description,
  ogSiteName: () => storeName.value,
  ogType: 'website',
  ogUrl: () => `${siteUrl}${route.path}`,
  ogImage: store.hero.image || undefined,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
