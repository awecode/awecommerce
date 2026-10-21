<script setup lang="ts">
// One offer, new (/offers/new) or saved: who it is for, which products, when
// it applies and what it gives, with a plain-sentence preview. Saved with
// Save or ⌘S; leaving with unsaved changes asks first.

// Paths with an id are only known at run time, so the typed routes do not apply
const api = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const money = useMoney()
const choices = useCatalogChoices()
const queryCache = useQueryCache()

const offerId = computed(() => (route.params.id === 'new' ? null : Number(route.params.id)))
const isNew = computed(() => offerId.value === null)

const { data: offer, error } = useQuery({
  key: () => ['offer', offerId.value ?? 0],
  query: () => api<Parameters<typeof offerFormFrom>[0] & { usageCount: number | null }>(`/api/admin/offers/${offerId.value}/with-parts`),
  enabled: () => !isNew.value,
})

// ---- the form, and what was last saved, to tell when it has changes
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const state = reactive<OfferForm>(emptyOfferForm())
// The chosen plans' names, for the summary (the same request as the plan picker's)
const { data: chosenPlans } = useQuery({
  key: () => ['membership-plans', 'picker-chosen', state.planIds],
  query: () => apiGet('/api/admin/membership-plans', { query: { ids: state.planIds.join(','), size: 100 } }),
  enabled: () => state.planIds.length > 0,
})
const planItems = computed(() => (chosenPlans.value?.results ?? []).map((plan) => ({ label: `${plan.name} (${plan.program})`, value: plan.id })))
const savedForm = ref<OfferForm>(clone(state))
const dirty = computed(() => JSON.stringify(state) !== JSON.stringify(savedForm.value))
const load = (form: OfferForm) => {
  Object.assign(state, clone(form))
  savedForm.value = clone(form)
}
watch(offer, (value) => {
  if (value && !dirty.value) load(offerFormFrom(value))
}, { immediate: true })
watch(isNew, (value) => {
  if (value) load(emptyOfferForm())
}, { immediate: true })
// A saved offer's form shows (and saves) once it has loaded, so nothing typed
// before then is lost or saved over it
const ready = computed(() => isNew.value || offer.value !== undefined)

useSeoMeta({ title: () => state.name || (isNew.value ? 'New offer' : 'Offer') })

// ---- choices
const typeItems = [
  { label: 'Automatic', description: 'Every cart that qualifies, guests included', value: 'site' },
  { label: 'Customers', description: 'Signed-in customers you choose, or members of plans', value: 'user' },
  { label: 'Voucher', description: 'Buyers type in a code', value: 'voucher' },
]
const conditionItems = [
  { label: 'Units of one product', value: 'basket_quantity' },
  { label: 'Amount spent on these products', value: 'basket_total' },
  { label: 'Different products', value: 'distinct_items' },
]
const benefitItems = [
  { label: 'Percent off', value: 'percentage' },
  { label: 'Amount off each unit', value: 'fixed_amount' },
  { label: 'Price for each unit', value: 'fixed_price' },
  { label: 'Free shipping', value: 'free_shipping' },
]
const conditionHelp = computed(
  () =>
    ({
      basket_quantity: 'A product (any of its variants) reaches this many units in the cart; 1 for any quantity',
      basket_total: 'These products together come to at least this much, at their selling prices',
      distinct_items: 'The cart has at least this many different products from the list',
    })[state.conditionType],
)

// ---- the image, uploaded on save like product images
const pendingImage = ref<File | null>(null)
const chooseImage = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast.add({ title: `${file.name}: images must be JPEG, PNG or WebP`, color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  if (state.image?.startsWith('blob:')) URL.revokeObjectURL(state.image)
  pendingImage.value = file
  state.image = URL.createObjectURL(file)
}
const removeImage = () => {
  pendingImage.value = null
  state.image = null
}
const imageInput = useTemplateRef('imageInput')
const uploadImage = async () => {
  if (!pendingImage.value) return
  const slug = slugify(state.name)
  if (!isStorageSlug(slug)) {
    throw new Error('Set a name that becomes a slug (lowercase letters, numbers, hyphens) before uploading the image.')
  }
  const { url } = await uploadAdminImage(pendingImage.value, { folder: 'offers', slug })
  state.image = url
  pendingImage.value = null
}

// ---- the sentence the offer reads as
const label = (items: { label: string; value: number }[], ids: number[]) =>
  ids.map((id) => items.find((item) => item.value === id)?.label).filter(Boolean) as string[]
const list = (names: string[]) => (names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', '))
const preview = computed(() => {
  const value = state.benefitValue || '…'
  const gives = state.benefitType === 'free_shipping' ? 'Free shipping' : benefitText(state.benefitType, value, (v) => (v === '…' ? '…' : money(v)))
  const units = state.benefitType !== 'free_shipping' && state.maxAffectedItems ? ` on up to ${state.maxAffectedItems} unit${state.maxAffectedItems === 1 ? '' : 's'} per line` : ''
  const when = conditionText(state.conditionType, state.conditionValue || '1', money)
  const chosen = [
    ...state.products.map((p) => p.name),
    ...label(choices.categories.value, state.categories),
    ...label(choices.brands.value, state.brands),
    ...label(choices.classes.value, state.productClasses),
  ]
  const except = [
    ...state.exceptProducts.map((p) => p.name),
    ...label(choices.categories.value, state.exceptCategories),
    ...label(choices.brands.value, state.exceptBrands),
    ...label(choices.classes.value, state.exceptProductClasses),
  ]
  const on = state.customRange ? 'the products set up through the API' : state.all ? 'every product' : chosen.length ? list(chosen) : 'no products yet'
  const who =
    state.type === 'site'
      ? 'For every cart.'
      : [
          state.type === 'voucher' ? `With the code ${state.voucherCode.trim() || '…'},` : '',
          state.everyone
            ? 'for every signed-in customer.'
            : `for ${[
                state.users.length ? `${state.users.length} chosen customer${state.users.length === 1 ? '' : 's'}` : '',
                state.planIds.length ? `members of ${list(label(planItems.value, state.planIds))}` : '',
              ]
                .filter(Boolean)
                .join(' and ') || 'nobody yet'}.`,
        ]
          .filter(Boolean)
          .join(' ')
  const day = (local: string) => new Date(local).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const dates = state.startDate && state.endDate
    ? `From ${day(state.startDate)} to ${day(state.endDate)}.`
    : state.startDate
      ? `From ${day(state.startDate)}.`
      : state.endDate
        ? `Until ${day(state.endDate)}.`
        : ''
  return [
    `${gives}${units} ${when}, on ${on}${except.length ? `, except ${list(except)}` : ''}.`,
    who.charAt(0).toUpperCase() + who.slice(1),
    dates,
    state.combinesWithOtherOffers ? '' : 'Does not combine with other offers: the cart takes the bigger discount.',
  ]
    .filter(Boolean)
    .join(' ')
})

// ---- saving
const form = useTemplateRef('form')
const saving = ref(false)
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
    await uploadImage()
    const body = offerBody(state)
    if (offerId.value === null) {
      const created = await api<{ id: number }>('/api/admin/offers/with-parts', { method: 'POST', body })
      savedForm.value = clone(state)
      toast.add({ title: `Created ${body.name}`, color: 'success', icon: 'i-lucide-check' })
      await router.replace(`/offers/${created.id}`)
    } else {
      await api(`/api/admin/offers/${offerId.value}/with-parts`, { method: 'PATCH', body })
      savedForm.value = clone(state)
      toast.add({ title: `Saved ${body.name}`, color: 'success', icon: 'i-lucide-check' })
    }
    await queryCache.invalidateQueries({ key: ['offers'] })
    await queryCache.invalidateQueries({ key: ['offer'] })
    return true
  } catch (error) {
    toast.add({ title: 'Could not save', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    return false
  } finally {
    saving.value = false
  }
}
const discard = () => {
  pendingImage.value = null
  load(savedForm.value)
}
defineShortcuts({ meta_s: { usingInput: true, handler: async () => { await commitFocusedField(); await save() } } })
// Enter in a field does not save; only Save and ⌘S do
const keepEnter = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement).tagName === 'INPUT') event.preventDefault()
}

const remove = async () => {
  const go = await confirm({
    title: `Delete ${savedForm.value.name}?`,
    description: 'Carts stop getting it. Orders keep their own copy of the offers they used.',
    confirmLabel: 'Delete',
    color: 'error',
  })
  if (!go) return
  try {
    await api(`/api/admin/offers/${offerId.value}/with-parts`, { method: 'DELETE' })
    load(clone(savedForm.value))
    toast.add({ title: `Deleted ${savedForm.value.name}`, color: 'success', icon: 'i-lucide-check' })
    await queryCache.invalidateQueries({ key: ['offers'] })
    await navigateTo('/offers')
  } catch (error) {
    toast.add({ title: 'Could not delete', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

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
</script>

<template>
  <UDashboardPanel id="offer">
    <template #header>
      <UDashboardNavbar :title="state.name || (isNew ? 'New offer' : '')">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/offers" aria-label="Back to offers" />
        </template>
        <template v-if="!error && !isNew && ready" #trailing>
          <UBadge :color="savedForm.isActive ? 'success' : 'neutral'" variant="subtle" :label="savedForm.isActive ? 'Active' : 'Inactive'" />
        </template>
        <template v-if="!error && ready" #right>
          <span v-if="dirty" class="text-xs text-muted">Unsaved changes</span>
          <UButton v-if="dirty && !isNew" color="neutral" variant="ghost" label="Discard" @click="discard" />
          <UButton :loading="saving" :label="isNew ? 'Create' : 'Save'" @click="save">
            <template #trailing>
              <UKbd value="meta" size="sm" /><UKbd value="s" size="sm" />
            </template>
          </UButton>
          <UDropdownMenu v-if="!isNew" :items="[[{ label: 'Delete offer', icon: 'i-lucide-trash', color: 'error', onSelect: remove }]]" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="More actions" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-badge-x"
        :title="isNotFound(error) ? 'No such offer' : 'This offer could not be loaded'"
        :description="isNotFound(error) ? 'It may have been deleted.' : apiErrorMessage(error)"
        :actions="[{ label: 'Back to offers', to: '/offers', color: 'neutral', variant: 'outline' }]"
        class="m-auto"
      />
      <div v-else-if="!ready" role="status" class="m-auto flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading…
      </div>
      <UForm
        v-else
        ref="form"
        :schema="offerFormSchema"
        :state="state"
        :validate-on="[]"
        class="@container"
        @submit.prevent
        @keydown.enter="keepEnter"
      >
        <UAlert color="neutral" variant="subtle" icon="i-lucide-text" :title="preview" data-testid="offer-preview" class="mb-6" />

        <div class="flex flex-col gap-8 @4xl:flex-row">
          <div class="min-w-0 flex-1 space-y-8">
            <section class="space-y-4" aria-labelledby="details">
              <h2 id="details" class="text-sm font-semibold text-highlighted">Details</h2>
              <UFormField label="Name" name="name" required help="Shown to buyers in the cart">
                <UInput v-model="state.name" class="w-full" />
              </UFormField>
              <UFormField label="Type" name="type">
                <URadioGroup v-model="state.type" :items="typeItems" variant="table" orientation="horizontal" aria-label="Type" />
              </UFormField>
              <UFormField v-if="state.type === 'voucher'" label="Voucher code" name="voucherCode" required>
                <UInput v-model="state.voucherCode" class="w-60 font-mono" />
              </UFormField>
              <UFormField label="Description" name="description">
                <UTextarea v-model="state.description" :rows="2" autoresize class="w-full" />
              </UFormField>
            </section>

            <section v-if="state.type !== 'site'" class="space-y-4" aria-labelledby="who">
              <h2 id="who" class="text-sm font-semibold text-highlighted">Who gets it</h2>
              <UFormField name="everyone">
                <USwitch v-model="state.everyone" label="Every signed-in customer" />
              </UFormField>
              <template v-if="!state.everyone">
                <UFormField label="Customers">
                  <OffersCustomerPicker v-model="state.users" />
                </UFormField>
                <UFormField label="Members of plans" help="Customers with an active membership of these plans">
                  <MembershipsPlanPicker v-model="state.planIds" multiple placeholder="Choose plans" aria-label="Members of plans" class="w-80" />
                </UFormField>
              </template>
            </section>

            <section class="space-y-4" aria-labelledby="products">
              <h2 id="products" class="text-sm font-semibold text-highlighted">Products</h2>
              <UAlert
                v-if="state.customRange"
                color="neutral"
                variant="subtle"
                title="These products were set up through the offer ranges API, in a way this form cannot show. They stay as they are."
              />
              <template v-else>
                <UFormField name="all">
                  <URadioGroup
                    v-model="state.all"
                    :items="[{ label: 'Every product', value: true }, { label: 'Any of these', value: false }]"
                    orientation="horizontal"
                    aria-label="Products"
                  />
                </UFormField>
                <div v-if="!state.all" class="grid gap-4 @2xl:grid-cols-2">
                  <UFormField label="Products">
                    <ProductsRelatedPicker v-model="state.products" placeholder="Add a product" />
                  </UFormField>
                  <UFormField label="Categories">
                    <USelectMenu v-model="state.categories" :items="choices.categories.value" value-key="value" multiple placeholder="Any" aria-label="Categories" class="w-full" />
                  </UFormField>
                  <UFormField label="Brands">
                    <USelectMenu v-model="state.brands" :items="choices.brands.value" value-key="value" multiple placeholder="Any" aria-label="Brands" class="w-full" />
                  </UFormField>
                  <UFormField label="Product classes">
                    <USelectMenu v-model="state.productClasses" :items="choices.classes.value" value-key="value" multiple placeholder="Any" aria-label="Product classes" class="w-full" />
                  </UFormField>
                </div>
                <details class="group" :open="Boolean(state.exceptProducts.length || state.exceptCategories.length || state.exceptBrands.length || state.exceptProductClasses.length)">
                  <summary class="cursor-pointer text-sm text-muted">Except</summary>
                  <div class="mt-3 grid gap-4 @2xl:grid-cols-2">
                    <UFormField label="Products">
                      <ProductsRelatedPicker v-model="state.exceptProducts" placeholder="Leave out a product" />
                    </UFormField>
                    <UFormField label="Categories">
                      <USelectMenu v-model="state.exceptCategories" :items="choices.categories.value" value-key="value" multiple placeholder="None" aria-label="Except categories" class="w-full" />
                    </UFormField>
                    <UFormField label="Brands">
                      <USelectMenu v-model="state.exceptBrands" :items="choices.brands.value" value-key="value" multiple placeholder="None" aria-label="Except brands" class="w-full" />
                    </UFormField>
                    <UFormField label="Product classes">
                      <USelectMenu v-model="state.exceptProductClasses" :items="choices.classes.value" value-key="value" multiple placeholder="None" aria-label="Except product classes" class="w-full" />
                    </UFormField>
                  </div>
                </details>
                <p class="text-xs text-muted">A category covers its subcategories too.</p>
              </template>
            </section>

            <section class="space-y-4" aria-labelledby="rule">
              <h2 id="rule" class="text-sm font-semibold text-highlighted">When and what</h2>
              <div class="grid gap-4 @2xl:grid-cols-2">
                <UFormField label="Applies when" :help="conditionHelp">
                  <USelect v-model="state.conditionType" :items="conditionItems" aria-label="Applies when" class="w-full" />
                </UFormField>
                <UFormField label="At least" name="conditionValue" required>
                  <UInput v-model="state.conditionValue" inputmode="decimal" class="w-32" />
                </UFormField>
                <UFormField label="Gives">
                  <USelect v-model="state.benefitType" :items="benefitItems" aria-label="Gives" class="w-full" />
                </UFormField>
                <UFormField v-if="state.benefitType !== 'free_shipping'" :label="state.benefitType === 'percentage' ? 'Percent' : 'Amount'" name="benefitValue" required>
                  <UInput v-model="state.benefitValue" inputmode="decimal" class="w-32" />
                </UFormField>
              </div>
              <UFormField v-if="state.benefitType !== 'free_shipping'" label="Units per line" hint="Optional" help="At most this many units of each line get it; empty for all">
                <UInputNumber v-model="state.maxAffectedItems" :min="1" placeholder="All" class="w-32" />
              </UFormField>
            </section>
          </div>

          <aside class="space-y-6 text-sm @4xl:w-80 @4xl:shrink-0">
            <UFormField name="isActive">
              <USwitch v-model="state.isActive" label="Active" description="Off: carts stop getting it, whatever its dates" />
            </UFormField>
            <section class="space-y-3" aria-labelledby="schedule">
              <h2 id="schedule" class="text-xs font-medium text-muted">Schedule</h2>
              <UFormField label="Starts" hint="Optional">
                <UInput v-model="state.startDate" type="datetime-local" aria-label="Starts" class="w-full" />
              </UFormField>
              <UFormField label="Ends" name="endDate" hint="Optional">
                <UInput v-model="state.endDate" type="datetime-local" aria-label="Ends" class="w-full" />
              </UFormField>
            </section>
            <section class="space-y-3" aria-labelledby="limits">
              <h2 id="limits" class="text-xs font-medium text-muted">Limits</h2>
              <UFormField label="Per customer" hint="Optional">
                <UInputNumber v-model="state.limitPerUser" :min="1" placeholder="No limit" class="w-32" />
              </UFormField>
              <UFormField label="Overall" hint="Optional">
                <UInputNumber v-model="state.overallLimit" :min="1" placeholder="No limit" class="w-32" />
              </UFormField>
              <p v-if="!isNew" class="text-muted">Used {{ offer?.usageCount ?? 0 }} time{{ offer?.usageCount === 1 ? '' : 's' }} so far.</p>
            </section>
            <section class="space-y-3" aria-labelledby="combining">
              <h2 id="combining" class="text-xs font-medium text-muted">Combining</h2>
              <USwitch v-model="state.combinesWithOtherOffers" label="Combines with other offers" description="Off: when it applies, the cart takes whichever is bigger, this offer alone or the others together" />
              <UFormField label="Priority" help="Among offers that combine, higher applies first">
                <UInputNumber v-model="state.priority" class="w-32" />
              </UFormField>
            </section>
            <section class="space-y-3" aria-labelledby="showcase">
              <h2 id="showcase" class="text-xs font-medium text-muted">Showcase</h2>
              <USwitch v-model="state.isFeatured" label="Featured" description="For a storefront offers block, when there is one" />
              <div class="space-y-2">
                <AppImage v-if="state.image" :src="state.image" alt="" :width="960" :height="540" class="aspect-video w-full rounded-md border border-default object-cover" />
                <div class="flex gap-2">
                  <UButton :label="state.image ? 'Replace image' : 'Add image'" icon="i-lucide-image-plus" color="neutral" variant="outline" size="sm" @click="imageInput?.click()" />
                  <UButton v-if="state.image" label="Remove" color="neutral" variant="ghost" size="sm" @click="removeImage" />
                </div>
                <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose image" class="sr-only" @change="chooseImage">
                <p v-if="pendingImage" class="text-xs text-muted">Uploaded when you save.</p>
              </div>
            </section>
          </aside>
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
