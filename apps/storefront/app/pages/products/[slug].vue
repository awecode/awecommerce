<script setup lang="ts">
// A product: its images, the variant picked by option (kept in the URL as
// `variant`, so a link opens the same one), stock, the buyer's answers to its
// fields, and adding it to the cart (which opens the cart drawer). Also its SEO tags and Product JSON-LD,
// and the member price when members of a plan pay less.
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { store } = useAppConfig()
const { data: settings } = useStoreSettings()
const { add: addToCart, drawerOpen } = useCart()
const money = useMoney()

const { data: product, error } = await useFetch(() => `/api/store/products/${route.params.slug}`)
if (error.value || !product.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, statusMessage: 'Page not found', fatal: true })
}

type Variant = NonNullable<typeof product.value>['variants'][number]
const variants = computed(() => product.value?.variants ?? [])
const has = (variant: Variant, name: string, value: string) => variant.options.some((o) => o.name === name && o.value === value)

// The options and the values that some variant for sale has
const options = computed(() =>
  (product.value?.options ?? [])
    .map((option) => ({
      name: option.name,
      values: option.values.map((v) => v.value).filter((value) => variants.value.some((variant) => has(variant, option.name, value))),
    }))
    .filter((option) => option.values.length),
)

// ---- picking a variant
const selected = ref<Record<string, string>>({})
const pick = (variant: Variant | undefined) => {
  if (variant) selected.value = Object.fromEntries(variant.options.map((o) => [o.name, o.value]))
}
const matches = (variant: Variant, choice: Record<string, string>) =>
  options.value.every((option) => has(variant, option.name, choice[option.name] ?? ''))
const variant = computed(() =>
  options.value.length ? variants.value.find((v) => matches(v, selected.value)) ?? null : variants.value[0] ?? null,
)
// The variant in the URL, else the first one in stock
watch(product, () => {
  const fromUrl = variants.value.find((v) => v.id === Number(route.query.variant))
  pick(fromUrl ?? variants.value.find((v) => v.inStock) ?? variants.value[0])
}, { immediate: true })

// Picks the value; when no variant has it with the other choices, switches to
// a variant that has it (one in stock if there is one)
const choose = (name: string, value: string) => {
  const choice = { ...selected.value, [name]: value }
  const withValue = variants.value.filter((v) => has(v, name, value))
  pick(variants.value.find((v) => matches(v, choice)) ?? withValue.find((v) => v.inStock) ?? withValue[0])
  if (variant.value) router.replace({ query: { ...route.query, variant: variant.value.id } })
}
// Sold out when every variant it would lead to is
const soldOut = (name: string, value: string) => {
  const others = variants.value.filter((v) => has(v, name, value) && options.value.every((o) => o.name === name || has(v, o.name, selected.value[o.name] ?? '')))
  return (others.length ? others : variants.value.filter((v) => has(v, name, value))).every((v) => !v.inStock)
}

// ---- stock
const tracked = computed(() => product.value?.productClass?.trackStock !== false)
const stockNote = computed(() => {
  if (!variant.value) return 'Choose an option'
  if (!variant.value.inStock) return 'Sold out'
  const left = variant.value.stockQuantity ?? 0
  return tracked.value && left <= 5 ? `Only ${left} left` : 'In stock'
})

// ---- the buyer's answers, quantity and adding to the cart
const fields = computed(() => product.value?.customFields ?? [])
const answers = reactive<Record<string, string>>({})
const quantity = ref(1)
const adding = ref(false)
const validate = () =>
  fields.value
    .filter((field) => field.required && !answers[field.label]?.trim())
    .map((field) => ({ name: field.label, message: `Enter ${field.label}` }))

const add = async () => {
  if (!variant.value) return
  adding.value = true
  try {
    const customizations = Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim()))
    await addToCart(variant.value.id, quantity.value, customizations)
    drawerOpen.value = true
  } catch (error) {
    toast.add({ title: 'Could not add to your cart', description: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    adding.value = false
  }
}

// ---- page furniture
const images = computed(() => {
  const list = product.value?.images ?? []
  return list.length ? list : product.value?.thumbnail ? [product.value.thumbnail] : []
})
const breadcrumb = computed(() => [
  { label: 'Home', to: '/' },
  ...(product.value?.category ? [{ label: product.value.category.name, to: `/categories/${product.value.category.slug}` }] : []),
  { label: product.value?.name ?? '' },
])

// ---- SEO
const siteUrl = (useRuntimeConfig().public.siteUrl || useRequestURL().origin).replace(/\/$/, '')
const pageUrl = computed(() => `${siteUrl}/products/${product.value?.slug}`)
const description = computed(() => htmlToText(product.value?.description).slice(0, 160) || store.description)
useSeoMeta({
  title: () => product.value?.name,
  description,
  ogTitle: () => product.value?.name,
  ogDescription: description,
  ogImage: () => images.value[0],
  ogType: 'product' as never,
})

// The selling price: the sale price when there is one
const sellingPrice = (v: Variant) => trimDecimal(v.discountedPrice ?? v.price)
const jsonLd = computed(() => {
  const p = product.value
  if (!p) return '{}'
  const currency = settings.value?.currency ?? 'USD'
  const availability = (inStock: boolean) => `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`
  const priced = p.variants.filter((v) => sellingPrice(v))
  const prices = priced.map((v) => Number(sellingPrice(v)))
  const offers = priced.length === 1
    ? { '@type': 'Offer', price: sellingPrice(priced[0]!), priceCurrency: currency, availability: availability(priced[0]!.inStock), url: pageUrl.value }
    : {
        '@type': 'AggregateOffer',
        lowPrice: String(Math.min(...prices)),
        highPrice: String(Math.max(...prices)),
        offerCount: priced.length,
        priceCurrency: currency,
        availability: availability(priced.some((v) => v.inStock)),
      }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: htmlToText(p.description) || undefined,
    image: images.value.length ? images.value : undefined,
    sku: p.variants.length === 1 ? p.variants[0]!.sku : undefined,
    brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : undefined,
    url: pageUrl.value,
    offers: priced.length ? offers : undefined,
  }).replace(/</g, '\\u003c')
})
useHead({ script: [{ type: 'application/ld+json', innerHTML: jsonLd }] })
</script>

<template>
  <div v-if="product">
    <UContainer class="py-8 lg:py-12">
      <UBreadcrumb :items="breadcrumb" class="mb-8" />

      <div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <ProductGallery :images="images" :alt="product.name" />

        <div class="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div class="space-y-3">
            <NuxtLink v-if="product.brand" :to="`/brands/${product.brand.slug}`" class="text-xs tracking-wider text-muted uppercase hover:underline">
              {{ product.brand.name }}
            </NuxtLink>
            <h1 class="text-3xl leading-tight font-medium tracking-tight sm:text-4xl">{{ product.name }}</h1>
            <div data-testid="price" class="text-2xl">
              <PriceTag v-if="variant" :price="variant.price" :sale="variant.discountedPrice" />
            </div>
            <p v-if="variant?.memberPrice" data-testid="member-price" class="text-sm">
              {{ variant.memberPrice.isYours ? `Your ${variant.memberPrice.planName} price` : `${variant.memberPrice.planName} members` }}:
              <span class="font-serif text-base">{{ money(variant.memberPrice.price) }}</span>
            </p>
          </div>

          <div v-for="option in options" :key="option.name" class="space-y-3">
            <p class="text-sm">
              {{ option.name }}: <span class="text-muted">{{ selected[option.name] }}</span>
            </p>
            <div role="radiogroup" :aria-label="option.name" class="flex flex-wrap gap-2">
              <button
                v-for="value in option.values"
                :key="value"
                type="button"
                role="radio"
                :aria-checked="selected[option.name] === value"
                :aria-label="soldOut(option.name, value) ? `${value}, sold out` : value"
                class="min-w-12 rounded-full border px-4 py-2 text-sm transition"
                :class="[
                  selected[option.name] === value ? 'border-(--ui-primary) bg-(--ui-primary) text-inverted' : 'border-default hover:border-(--ui-primary)',
                  soldOut(option.name, value) && selected[option.name] !== value ? 'text-dimmed line-through' : '',
                ]"
                @click="choose(option.name, value)"
              >
                {{ value }}
              </button>
            </div>
          </div>

          <UForm :state="answers" :validate="validate" :validate-on="[]" class="space-y-5" @submit="add">
            <UFormField
              v-for="field in fields"
              :key="field.label"
              :name="field.label"
              :label="field.label"
              :required="field.required"
              :help="`Up to ${field.maxLength} characters`"
            >
              <UInput v-model="answers[field.label]" :maxlength="field.maxLength" size="lg" class="w-full" />
            </UFormField>

            <p class="flex items-center gap-2 text-sm" :class="variant?.inStock ? 'text-muted' : 'text-error'">
              <span class="size-2 rounded-full" :class="variant?.inStock ? 'bg-success' : 'bg-error'" />
              {{ stockNote }}
            </p>

            <div class="flex gap-3">
              <UInputNumber
                v-model="quantity"
                :min="1"
                :max="tracked && variant?.inStock ? variant.stockQuantity ?? undefined : undefined"
                aria-label="Quantity"
                size="xl"
                class="w-32"
              />
              <UButton
                type="submit"
                size="xl"
                block
                :loading="adding"
                :disabled="!variant?.inStock"
                :label="variant && !variant.inStock ? 'Sold out' : 'Add to cart'"
                class="flex-1"
              />
            </div>
          </UForm>

          <section v-if="variant?.membership" aria-labelledby="membership" data-testid="membership" class="space-y-2 rounded-sm bg-muted p-5">
            <h2 id="membership" class="font-sans text-xs font-medium tracking-wider text-muted uppercase">What members get</h2>
            <p class="font-medium">
              {{ variant.membership.planName }} membership · {{ variant.membership.months }} month{{ variant.membership.months === 1 ? '' : 's' }}
            </p>
            <div v-if="variant.membership.description" class="rich-text text-sm text-default" v-html="variant.membership.description" />
          </section>

          <div v-if="product.description" class="rich-text text-default" v-html="product.description" />

          <UAccordion
            v-if="product.specification"
            :items="[{ label: 'Details', slot: 'details' as const }]"
            :ui="{ trigger: 'font-medium' }"
          >
            <template #details>
              <div class="rich-text pb-4 text-default" v-html="product.specification" />
            </template>
          </UAccordion>
        </div>
      </div>
    </UContainer>

    <ProductShelf title="You may also like" :products="product.relatedProducts" />
  </div>
</template>
