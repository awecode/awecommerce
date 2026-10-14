<script setup lang="ts">
// The home page's opening: headline, text, button and image from
// app.config.ts. Without an image, the text sits centred on its own.
const { hero } = useAppConfig().store
</script>

<template>
  <section>
    <UContainer v-if="hero.image" class="grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
      <div class="max-w-xl space-y-6">
        <h1 class="text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl">{{ hero.title }}</h1>
        <p class="text-lg text-muted text-pretty">{{ hero.text }}</p>
        <UButton :to="hero.cta.to" :label="hero.cta.label" size="xl" trailing-icon="i-lucide-arrow-right" />
      </div>
      <img :src="hero.image" alt="" class="aspect-4/5 w-full rounded-sm object-cover">
    </UContainer>
    <UContainer v-else class="flex flex-col items-center gap-6 py-24 text-center lg:py-36">
      <h1 class="max-w-3xl text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl lg:text-7xl">{{ hero.title }}</h1>
      <p class="max-w-xl text-lg text-muted text-pretty">{{ hero.text }}</p>
      <UButton :to="hero.cta.to" :label="hero.cta.label" size="xl" trailing-icon="i-lucide-arrow-right" />
    </UContainer>
  </section>
</template>
