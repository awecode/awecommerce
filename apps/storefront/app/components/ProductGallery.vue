<script setup lang="ts">
// The product's images: a large one and thumbnails to switch between them
const props = defineProps<{ images: string[]; alt: string }>()
const current = ref(0)
watch(() => props.images, () => (current.value = 0))
</script>

<template>
  <div class="space-y-3">
    <div class="aspect-4/5 overflow-hidden rounded-sm bg-elevated">
      <img v-if="images.length" :src="images[current]" :alt="alt" class="size-full object-cover">
      <div v-else class="flex size-full items-center justify-center">
        <UIcon name="i-lucide-image" class="size-10 text-dimmed" />
      </div>
    </div>
    <ul v-if="images.length > 1" class="grid grid-cols-5 gap-3">
      <li v-for="(image, index) in images" :key="image">
        <button
          type="button"
          class="block aspect-square w-full overflow-hidden rounded-sm bg-elevated ring-offset-2 ring-offset-(--ui-bg) transition active:scale-95"
          :class="index === current ? 'ring-2 ring-(--ui-primary)' : 'opacity-70 hover:opacity-100'"
          :aria-label="`Show image ${index + 1} of ${images.length}`"
          :aria-current="index === current"
          @click="current = index"
        >
          <img :src="image" alt="" class="size-full object-cover">
        </button>
      </li>
    </ul>
  </div>
</template>
