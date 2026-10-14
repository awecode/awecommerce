<script setup lang="ts">
import type { NuxtError } from '#app'

// Not found and other errors, inside the shop's header and footer
const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)

useSeoMeta({ title: () => (notFound.value ? 'Page not found' : 'Something went wrong'), robots: 'noindex' })
</script>

<template>
  <UApp>
    <NuxtLayout>
      <UContainer class="flex flex-col items-center gap-5 py-32 text-center">
        <p class="text-sm tracking-wider text-muted uppercase">{{ error.statusCode }}</p>
        <h1 class="text-4xl font-medium">{{ notFound ? 'Page not found' : 'Something went wrong' }}</h1>
        <p class="max-w-md text-muted">
          {{ notFound ? 'The page may have moved, or the product is no longer for sale.' : 'Please try again in a moment.' }}
        </p>
        <UButton label="Continue shopping" to="/" @click="clearError({ redirect: '/' })" />
      </UContainer>
    </NuxtLayout>
  </UApp>
</template>
