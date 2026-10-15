<script setup lang="ts">
// The product's images, in order, and which one is the thumbnail shown in
// lists: the first image added, until another is chosen. New images are
// files chosen here: they stay on the form as local previews (blob: URLs in
// `images`, their files in `pending`) and are uploaded when the product is
// saved. Links cannot be pasted.
const images = defineModel<string[]>('images', { required: true })
const thumbnail = defineModel<string | null>('thumbnail', { required: true })
// Preview URL to its file, for the images not uploaded yet; the page owns it
const props = defineProps<{ pending: Map<string, File> }>()

const types = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024
const errors = ref<string[]>([])
const input = useTemplateRef('input')

const choose = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = [...(target.files ?? [])]
  target.value = ''
  errors.value = []
  const added: string[] = []
  for (const file of files) {
    if (!types.includes(file.type)) {
      errors.value.push(`${file.name}: images must be JPEG, PNG or WebP`)
    } else if (file.size > MAX_BYTES) {
      errors.value.push(`${file.name}: images can be up to 8 MB`)
    } else {
      const preview = URL.createObjectURL(file)
      props.pending.set(preview, file)
      added.push(preview)
    }
  }
  if (!added.length) return
  images.value = [...images.value, ...added]
  if (!thumbnail.value) thumbnail.value = added[0]!
}

const remove = (image: string) => {
  // Only off the product: an uploaded image stays in the bucket
  images.value = images.value.filter((i) => i !== image)
  if (thumbnail.value === image) thumbnail.value = images.value[0] ?? null
  if (props.pending.delete(image)) URL.revokeObjectURL(image)
}
const move = (index: number, step: number) => {
  const next = [...images.value]
  const [image] = next.splice(index, 1)
  next.splice(index + step, 0, image!)
  images.value = next
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
      <div v-for="(image, index) in images" :key="image" class="group relative overflow-hidden rounded-md border border-default bg-elevated/40">
        <img :src="image" alt="" class="aspect-square w-full object-cover">
        <UBadge v-if="thumbnail === image" class="absolute top-1.5 left-1.5" color="primary" variant="solid">Thumbnail</UBadge>
        <UBadge v-if="pending.has(image)" class="absolute right-1.5 bottom-1.5 group-hover:opacity-0 group-focus-within:opacity-0" color="neutral" variant="solid">Not uploaded yet</UBadge>
        <div class="absolute inset-x-1 bottom-1 flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <UTooltip v-if="thumbnail !== image" text="Use as thumbnail">
            <UButton icon="i-lucide-star" color="neutral" variant="solid" size="xs" aria-label="Use as thumbnail" @click="thumbnail = image" />
          </UTooltip>
          <UButton v-if="index > 0" icon="i-lucide-arrow-left" color="neutral" variant="solid" size="xs" aria-label="Move earlier" @click="move(index, -1)" />
          <UButton v-if="index < images.length - 1" icon="i-lucide-arrow-right" color="neutral" variant="solid" size="xs" aria-label="Move later" @click="move(index, 1)" />
          <UButton icon="i-lucide-trash" color="error" variant="solid" size="xs" aria-label="Remove image" @click="remove(image)" />
        </div>
      </div>
      <button
        type="button"
        class="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-default text-xs text-muted hover:border-(--ui-primary) hover:text-default"
        @click="input?.click()"
      >
        <UIcon name="i-lucide-image-plus" class="size-5" />
        Add images
      </button>
    </div>
    <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose images" class="sr-only" @change="choose">
    <p class="text-xs text-muted">JPEG, PNG or WebP, up to 8 MB each. Uploaded when you save.</p>
    <p v-for="error in errors" :key="error" class="text-xs text-error">{{ error }}</p>
  </div>
</template>
