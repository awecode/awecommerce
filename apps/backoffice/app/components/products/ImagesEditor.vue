<script setup lang="ts">
// The product's images as pasted URLs, in order, and which one is the
// thumbnail shown in lists.
const images = defineModel<string[]>('images', { required: true })
const thumbnail = defineModel<string | null>('thumbnail', { required: true })

const url = ref('')
const add = () => {
  const value = url.value.trim()
  if (value && !images.value.includes(value)) images.value = [...images.value, value]
  url.value = ''
}
const remove = (image: string) => {
  images.value = images.value.filter((i) => i !== image)
  if (thumbnail.value === image) thumbnail.value = null
}
const move = (index: number, step: number) => {
  const next = [...images.value]
  const [image] = next.splice(index, 1)
  next.splice(index + step, 0, image!)
  images.value = next
}

// In the script, not the template: see the vue-tsc note in pages/catalog/brands.vue
const urlPlaceholder = 'https://…'
</script>

<template>
  <div class="space-y-3">
    <div v-if="images.length" class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
      <div v-for="(image, index) in images" :key="image" class="group relative overflow-hidden rounded-md border border-default bg-elevated/40">
        <img :src="image" alt="" class="aspect-square w-full object-cover">
        <UBadge v-if="thumbnail === image" class="absolute top-1.5 left-1.5" color="primary" variant="solid">Thumbnail</UBadge>
        <div class="absolute inset-x-1 bottom-1 flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <UTooltip v-if="thumbnail !== image" text="Use as thumbnail">
            <UButton icon="i-lucide-star" color="neutral" variant="solid" size="xs" aria-label="Use as thumbnail" @click="thumbnail = image" />
          </UTooltip>
          <UButton v-if="index > 0" icon="i-lucide-arrow-left" color="neutral" variant="solid" size="xs" aria-label="Move earlier" @click="move(index, -1)" />
          <UButton v-if="index < images.length - 1" icon="i-lucide-arrow-right" color="neutral" variant="solid" size="xs" aria-label="Move later" @click="move(index, 1)" />
          <UButton icon="i-lucide-trash" color="error" variant="solid" size="xs" aria-label="Remove image" @click="remove(image)" />
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <UInput v-model="url" :placeholder="urlPlaceholder" aria-label="Image URL" class="flex-1" @keydown.enter.prevent="add" />
      <UButton icon="i-lucide-plus" color="neutral" variant="outline" label="Add image" :disabled="!url.trim()" @click="add" />
    </div>
  </div>
</template>
