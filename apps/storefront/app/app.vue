<script setup lang="ts">
// SEO defaults for every page; pages set their own title and description
const { store } = useAppConfig()
const settings = useStoreSettings()
const route = useRoute()
const { siteUrl: configuredSiteUrl, googleAnalyticsId } = useRuntimeConfig().public
const siteUrl = (configuredSiteUrl || useRequestURL().origin).replace(/\/$/, '')
const storeName = computed(() => settings.value.name)

useHead({
  htmlAttrs: { lang: () => settings.value?.locale ?? 'en-US' },
  titleTemplate: (title) => (title ? `${title} · ${storeName.value}` : storeName.value),
  // The page without its query, so filtered and sorted views count as one
  link: [{ rel: 'canonical', href: () => `${siteUrl}${route.path}` }],
})

// Google Analytics, when a measurement id is set. It counts page changes in
// the app too (its enhanced measurement, on by default).
if (googleAnalyticsId) {
  useHead({
    script: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAnalyticsId)}`, async: true },
      {
        innerHTML: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(googleAnalyticsId)});`,
      },
    ],
  })
}
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
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
