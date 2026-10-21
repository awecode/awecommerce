<script setup lang="ts">
// One product, new (/products/new) or saved: its fields and variants are
// edited together and saved with Save or ⌘S. Leaving with unsaved changes asks
// first. On wide screens the product list sits beside it.

// Paths with an id are only known at run time, so the typed routes do not apply
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const choices = useCatalogChoices()

const productId = computed(() => (route.params.id === 'new' ? null : Number(route.params.id)))
const isNew = computed(() => productId.value === null)

const { data: product, error, refetch } = useQuery({
  key: () => ['product', productId.value],
  query: () => apiGetAt('/api/admin/products/:id', `/api/admin/products/${productId.value}`),
  enabled: () => !isNew.value,
})

// ---- the form, and what was last saved, to tell when it has changes
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const state = reactive<ProductForm>(emptyProductForm())
const savedForm = ref<ProductForm>(clone(state))
const slugTouched = ref(false)
const dirty = computed(() => JSON.stringify(state) !== JSON.stringify(savedForm.value))

const load = async (form: ProductForm) => {
  Object.assign(state, form)
  slugTouched.value = !isNew.value
  // The rich text editors may tidy what they are given; that is not a change
  await nextTick()
  await nextTick()
  savedForm.value = clone(state)
}
// A saved product's form shows (and saves) once it has loaded, so nothing
// typed before then is lost or saved over it
const ready = computed(() => isNew.value || product.value !== undefined)
watch(product, (value) => {
  if (value && !dirty.value) load(productFormFrom(value))
}, { immediate: true })
watch(isNew, (value) => {
  if (value) load(emptyProductForm())
}, { immediate: true })

useSeoMeta({ title: () => state.name || (isNew.value ? 'New product' : 'Product') })

// A new product's slug follows its name until the slug is edited by hand
watch(() => state.name, (name) => {
  if (isNew.value && !slugTouched.value) state.slug = slugify(name)
})

// ---- saving
const form = useTemplateRef('form')
const saving = ref(false)

const saveFailed = (error: unknown) =>
  toast.add({
    title: 'Could not save',
    description: isInUse(error) ? 'A variant that was ordered cannot be deleted. Deactivate it instead.' : apiErrorMessage(error),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  })

const create = async () => {
  const { sku, price, discountedPrice, inventoryCost, stockQuantity } = variantBody(state.variants[0]!)
  const created = await apiPost('/api/admin/products', {
    body: { ...productBody(state), sku, price, discountedPrice, inventoryCost, stockQuantity },
  })
  toast.add({ title: `Created ${state.name}`, color: 'success', icon: 'i-lucide-check' })
  savedForm.value = clone(state)
  await router.replace(`/products/${created.id}`)
}

// Saves the product, then its variants: deletions, changes, then new ones.
// Each step that succeeds counts as saved, so a failure leaves only the rest
// as unsaved changes.
const update = async (id: number) => {
  await api(`/api/admin/products/${id}`, { method: 'PATCH', body: productBody(state) })
  savedForm.value = { ...clone(state), variants: savedForm.value.variants }
  const savedRow = (row: VariantRow) => savedForm.value.variants.find((saved) => saved.key === row.key)

  for (const row of state.variants.filter((row) => row.removed && row.id)) {
    await api(`/api/admin/variants/${row.id}`, { method: 'DELETE' })
    state.variants = state.variants.filter((r) => r.key !== row.key)
    savedForm.value.variants = savedForm.value.variants.filter((r) => r.key !== row.key)
  }
  for (const row of state.variants.filter((row) => row.id && !row.removed)) {
    if (JSON.stringify(savedRow(row)) === JSON.stringify(row)) continue
    await api(`/api/admin/variants/${row.id}`, { method: 'PATCH', body: variantBody(row) })
    savedForm.value.variants = savedForm.value.variants.map((r) => (r.key === row.key ? clone(row) : r))
  }
  for (const row of state.variants.filter((row) => !row.id)) {
    const created = await api<{ id: number }>(`/api/admin/products/${id}/variants`, { method: 'POST', body: variantBody(row) })
    row.id = created.id
    savedForm.value.variants.push(clone(row))
  }
  toast.add({ title: `Saved ${state.name}`, color: 'success', icon: 'i-lucide-check' })
  await refetch()
}

// ---- images chosen on the form: uploaded when the product is saved
// Each preview (a blob: URL in state.images) and its file
const pendingImages = reactive(new Map<string, File>())
const dropPendingImages = () => {
  for (const preview of pendingImages.keys()) URL.revokeObjectURL(preview)
  pendingImages.clear()
}
onUnmounted(dropPendingImages)

// Uploads the images still on the form, in order, each under the slug, and
// puts its public URL in its place (the thumbnail too). Stops at the first
// failure: the ones already uploaded keep their URL, so a retry skips them.
// True when nothing is left to upload.
const uploadPendingImages = async () => {
  const waiting = state.images.filter((image) => pendingImages.has(image))
  if (!waiting.length) return true
  const slug = state.slug.trim()
  if (!isStorageSlug(slug)) {
    form.value?.setErrors([{ name: 'slug', message: 'Images are stored under the slug: use lowercase letters, numbers and hyphens' }], 'slug')
    toast.add({ title: 'Check the highlighted fields', color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
  for (const preview of waiting) {
    const file = pendingImages.get(preview)!
    try {
      const { url } = await uploadAdminImage(file, { folder: 'products', slug })
      state.images = state.images.map((image) => (image === preview ? url : image))
      if (state.thumbnail === preview) state.thumbnail = url
      pendingImages.delete(preview)
      URL.revokeObjectURL(preview)
    } catch (error) {
      toast.add({ title: `Could not upload ${file.name}`, description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }
  return true
}

// True when everything was saved
const save = async () => {
  if (saving.value || !ready.value) return false
  try {
    await form.value!.validate({})
  } catch {
    toast.add({ title: 'Check the highlighted fields', color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  }
  saving.value = true
  try {
    // Nothing is saved when an image does not upload
    if (!(await uploadPendingImages())) return false
    if (productId.value === null) await create()
    else await update(productId.value)
    return true
  } catch (error) {
    saveFailed(error)
    return false
  } finally {
    saving.value = false
  }
}

// Back to the saved product; images not uploaded yet are dropped
const discard = () => {
  dropPendingImages()
  return load(clone(savedForm.value))
}

defineShortcuts({ meta_s: { usingInput: true, handler: async () => { await commitFocusedField(); await save() } } })

// Enter in a field does not save; only Save and ⌘S do
const keepEnter = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement).tagName === 'INPUT') event.preventDefault()
}

// ---- options and variants from them: changed at once on the server, so
// pending changes are saved first
const generating = ref(false)
const whenSaved = async (action: () => Promise<string>, failure: string) => {
  if (dirty.value) {
    const go = await confirm({ title: 'Save your changes first?', description: 'This changes the saved product, so your changes are saved first.', confirmLabel: 'Save and continue' })
    if (!go || !(await save())) return
  }
  generating.value = true
  try {
    toast.add({ title: await action(), color: 'success', icon: 'i-lucide-check' })
    await refetch()
  } catch (error) {
    toast.add({ title: failure, description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    generating.value = false
  }
}
const generate = (options: Record<string, string[]>) =>
  whenSaved(async () => {
    const made = await api<unknown[]>(`/api/admin/products/${productId.value}/variants/generate`, { method: 'POST', body: { options } })
    return `Created ${made.length} variant${made.length === 1 ? '' : 's'}`
  }, 'Could not generate variants')
const renameOption = (id: number, name: string) =>
  whenSaved(async () => {
    await api(`/api/admin/options/${id}`, { method: 'PATCH', body: { name } })
    return `Renamed to ${name}`
  }, 'Could not rename')
const deleteOption = (id: number) =>
  whenSaved(async () => {
    await api(`/api/admin/options/${id}`, { method: 'DELETE' })
    return 'Deleted the option'
  }, 'Could not delete the option')
const renameValue = (id: number, value: string) =>
  whenSaved(async () => {
    await api(`/api/admin/option-values/${id}`, { method: 'PATCH', body: { value } })
    return `Renamed to ${value}`
  }, 'Could not rename')
const deleteValue = (id: number) =>
  whenSaved(async () => {
    await api(`/api/admin/option-values/${id}`, { method: 'DELETE' })
    return 'Deleted the value and its variants'
  }, 'Could not delete the value')
// One variant without options is edited as plain fields, not a table
const simple = computed(() => state.variants.length === 1 && !state.variants[0]!.options.length)
const optionNames = computed(() => (product.value?.options ?? []).map((option) => option.name))

// ---- leaving with unsaved changes
const confirmDiscard = () =>
  confirm({ title: 'Discard changes?', description: 'Your changes have not been saved.', confirmLabel: 'Discard', color: 'error' })
onBeforeRouteLeave(async () => !dirty.value || (await confirmDiscard()))
onBeforeRouteUpdate(async (to, from) => to.params.id === from.params.id || !dirty.value || (await confirmDiscard()))
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

const none = { label: 'None', value: null }
// In the script, not the template: see the vue-tsc note in pages/catalog/brands.vue
const linkPlaceholder = 'https://…'
</script>

<template>
  <ProductsSideList :current-id="productId" />

  <UDashboardPanel id="product">
    <template #header>
      <UDashboardNavbar :title="state.name || (isNew ? 'New product' : '')">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/products" aria-label="Back to products" class="2xl:hidden" />
        </template>
        <template v-if="!error && ready" #trailing>
          <UBadge v-if="!isNew" :color="savedForm.status === 'Published' ? 'success' : 'neutral'" variant="subtle">{{ savedForm.status }}</UBadge>
          <UBadge v-if="!isNew && !savedForm.isActive" color="warning" variant="subtle">Inactive</UBadge>
        </template>
        <template v-if="!error && ready" #right>
          <span v-if="dirty" class="text-xs text-muted">Unsaved changes</span>
          <UButton v-if="dirty && !isNew" color="neutral" variant="ghost" label="Discard" @click="discard" />
          <UButton :loading="saving" :label="isNew ? 'Create' : 'Save'" @click="save">
            <template #trailing>
              <UKbd value="meta" size="sm" /><UKbd value="s" size="sm" />
            </template>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-package-x"
        :title="isNotFound(error) ? 'No such product' : 'This product could not be loaded'"
        :description="isNotFound(error) ? 'It may have been deleted.' : apiErrorMessage(error)"
        :actions="[{ label: 'Back to products', to: '/products', color: 'neutral', variant: 'outline' }]"
        class="m-auto"
      />
      <div v-else-if="!ready" role="status" class="m-auto flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading…
      </div>
      <UForm
        v-else
        ref="form"
        :schema="productFormSchema"
        :state="state"
        class="@container"
        @keydown.enter="keepEnter"
      >
        <div class="mx-auto flex max-w-6xl flex-col gap-8 @4xl:flex-row">
          <div class="min-w-0 flex-1 space-y-8">
            <section class="space-y-4">
              <UFormField label="Name" name="name" required>
                <UInput v-model="state.name" size="lg" class="w-full" :autofocus="isNew" />
              </UFormField>
              <UFormField label="Description">
                <RichTextEditor :key="`description-${productId}`" v-model="state.description" placeholder="What buyers should know" />
              </UFormField>
            </section>

            <section class="space-y-3">
              <h2 class="text-sm font-semibold text-highlighted">Images</h2>
              <ProductsImagesEditor v-model:images="state.images" v-model:thumbnail="state.thumbnail" :pending="pendingImages" />
            </section>

            <section class="space-y-3">
              <h2 class="text-sm font-semibold text-highlighted">{{ simple ? 'Price and stock' : 'Variants' }}</h2>
              <div v-if="simple" class="grid grid-cols-2 gap-3 @xl:grid-cols-5">
                <UFormField label="SKU" name="variants.0.sku" required>
                  <UInput v-model="state.variants[0]!.sku" class="w-full font-mono" />
                </UFormField>
                <UFormField label="Price" name="variants.0.price">
                  <UInput v-model="state.variants[0]!.price" inputmode="decimal" class="w-full" />
                </UFormField>
                <UFormField label="Sale price" name="variants.0.discountedPrice">
                  <UInput v-model="state.variants[0]!.discountedPrice" inputmode="decimal" class="w-full" />
                </UFormField>
                <UFormField label="Cost" name="variants.0.inventoryCost" help="Not shown to buyers">
                  <UInput v-model="state.variants[0]!.inventoryCost" inputmode="decimal" class="w-full" />
                </UFormField>
                <UFormField label="Stock" name="variants.0.stockQuantity">
                  <UInputNumber v-model="state.variants[0]!.stockQuantity" :min="0" class="w-full" />
                </UFormField>
              </div>
              <ProductsVariantsTable v-else v-model="state.variants" :option-names="optionNames" />

              <div class="space-y-2 rounded-md border border-dashed border-default p-3">
                <p class="text-xs text-muted">Options, such as Size and Colour, give a variant for each combination of their values.</p>
                <ProductsOptionsEditor
                  :options="product?.options ?? []"
                  :variants="savedForm.variants.filter((variant) => variant.id)"
                  :disabled="isNew"
                  :loading="generating"
                  @generate="generate"
                  @rename-option="renameOption"
                  @delete-option="deleteOption"
                  @rename-value="renameValue"
                  @delete-value="deleteValue"
                />
              </div>
            </section>

            <section class="space-y-3">
              <h2 class="text-sm font-semibold text-highlighted">Specification</h2>
              <RichTextEditor :key="`specification-${productId}`" v-model="state.specification" placeholder="Materials, sizes, care" />
            </section>

            <section class="space-y-3">
              <div>
                <h2 class="text-sm font-semibold text-highlighted">Buyer input</h2>
                <p class="text-xs text-muted">Fields the buyer fills in when adding it to the cart, such as a name to engrave</p>
              </div>
              <ProductsCustomFieldsEditor v-model="state.customFields" />
            </section>

            <section class="space-y-3">
              <h2 class="text-sm font-semibold text-highlighted">Related products</h2>
              <ProductsRelatedPicker v-model="state.relatedProducts" :product-id="productId" />
            </section>
          </div>

          <aside class="space-y-4 @4xl:w-64 @4xl:shrink-0">
            <UFormField label="Status" name="status">
              <USelect v-model="state.status" :items="['Draft', 'Published']" class="w-full" />
            </UFormField>
            <div class="space-y-2">
              <USwitch v-model="state.isActive" label="Active" description="Inactive products are hidden from the store" />
              <USwitch v-model="state.isFeatured" label="Featured" />
              <USwitch v-model="state.isBestSeller" label="Best seller" />
            </div>
            <USeparator />
            <UFormField label="Category" name="categoryId">
              <USelectMenu v-model="state.categoryId" :items="[none, ...choices.categories.value]" value-key="value" placeholder="None" class="w-full" />
            </UFormField>
            <UFormField label="Brand" name="brandId">
              <USelectMenu v-model="state.brandId" :items="[none, ...choices.brands.value]" value-key="value" placeholder="None" class="w-full" />
            </UFormField>
            <UFormField label="Product class" name="productClassId" help="Sets the tax rate and stock tracking">
              <USelectMenu v-model="state.productClassId" :items="[none, ...choices.classes.value]" value-key="value" placeholder="None" class="w-full" />
            </UFormField>
            <USeparator />
            <UFormField label="Slug" name="slug" required help="Used in store links">
              <UInput v-model="state.slug" class="w-full font-mono" @update:model-value="slugTouched = true" />
            </UFormField>
            <UFormField label="External link" name="link">
              <UInput v-model="state.link" :placeholder="linkPlaceholder" class="w-full" />
            </UFormField>
          </aside>
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
