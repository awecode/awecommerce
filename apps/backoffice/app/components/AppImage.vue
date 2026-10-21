<script setup lang="ts">
// A photo at the size it is shown, as WebP, when image resizing is on (see
// `image` in nuxt.config.ts); otherwise the stored image. blob: and data:
// previews stay plain images.
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{
  src: string
  alt?: string
  // Pixels to fetch (about twice the CSS size)
  width: number
  height?: number
  fit?: 'cover' | 'contain'
  // Empty string keeps the original format (logos)
  format?: string
  loading?: 'lazy' | 'eager'
}>(), {
  alt: '',
  fit: 'cover',
  format: 'webp',
  loading: 'lazy',
})
</script>

<template>
  <img v-if="src.startsWith('blob:') || src.startsWith('data:')" v-bind="$attrs" :src="src" :alt="alt" :loading="loading">
  <NuxtImg
    v-else
    v-bind="$attrs"
    :src="src"
    :alt="alt"
    :width="width"
    :height="height"
    :fit="fit"
    :format="format || undefined"
    densities="1"
    :loading="loading"
  />
</template>
