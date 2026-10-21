<script setup lang="ts">
// A cart line: image, name, options and answers, price, quantity (not for
// something bought one at a time) and Remove, with what stops it from being
// checked out. `compact` is for the drawer.
const props = defineProps<{ line: CartLine; compact?: boolean }>()

const money = useMoney()
const toast = useToast()
const { setQuantity, remove } = useCart()
const busy = ref(false)

const product = computed(() => props.line.variant.product)
const image = computed(() => props.line.variant.image?.imageUrl ?? product.value.thumbnail)
const unitPrice = computed(() => props.line.variant.discountedPrice ?? props.line.variant.price)
const lineTotal = computed(() => (unitPrice.value ? Number(unitPrice.value) * props.line.quantity : null))
const details = computed(() => [
  ...props.line.variant.options.map((o) => `${o.name}: ${o.value}`),
  ...Object.entries(props.line.customizations ?? {}).map(([label, answer]) => `${label}: ${answer}`),
])
const problem = computed(() => lineProblem(props.line))

const run = async (action: () => Promise<unknown>) => {
  busy.value = true
  try {
    await action()
  } catch (error) {
    toast.add({ title: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <li class="flex gap-4 py-5" :class="{ 'opacity-60': busy }">
    <NuxtLink :to="`/products/${product.slug}`" class="shrink-0 overflow-hidden rounded-sm bg-elevated transition-opacity hover:opacity-90 active:opacity-75" :class="compact ? 'size-20' : 'size-24 sm:size-28'">
      <AppImage v-if="image" :src="image" :alt="product.name" :width="compact ? 160 : 256" :height="compact ? 160 : 256" class="size-full object-cover" />
    </NuxtLink>
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <div class="flex justify-between gap-4">
        <div class="min-w-0">
          <NuxtLink :to="`/products/${product.slug}`" class="font-medium hover:underline active:opacity-75">{{ product.name }}</NuxtLink>
          <p v-for="detail in details" :key="detail" class="text-sm text-muted">{{ detail }}</p>
        </div>
        <p class="shrink-0 font-serif">{{ money(lineTotal) }}</p>
      </div>
      <p v-if="problem" class="flex items-start gap-1.5 text-sm text-error">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />{{ problem }}
      </p>
      <div class="mt-auto flex items-center gap-3">
        <UInputNumber
          v-if="!line.oncePerPerson"
          :model-value="line.quantity"
          :min="1"
          :disabled="busy"
          :aria-label="`Quantity of ${product.name}`"
          size="sm"
          class="w-28"
          @update:model-value="(value) => value && value !== line.quantity && run(() => setQuantity(line.id, value))"
        />
        <UButton label="Remove" color="neutral" variant="link" size="sm" :aria-label="`Remove ${product.name}`" @click="run(() => remove(line.id))" />
      </div>
    </div>
  </li>
</template>
