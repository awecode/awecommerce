<script setup lang="ts">
// Checkout on one page: contact, address, delivery, points (members), payment
// and the summary. A cart with nothing to ship (digital goods) skips the
// address and delivery. The order is placed for the total shown; if it changed
// in the meantime, the new total is shown and the buyer places it again. With
// an online payment method, the buyer then goes to the gateway to pay.
useSeoMeta({ title: 'Checkout', robots: 'noindex' })

const { user } = useAuth()
const { cart, loaded: cartLoaded, refresh: refreshCart } = useCart()
const money = useMoney()
const requestFetch = useRequestFetch()

type Address = { id: number; line1: string; line2: string | null; city: string; province: string | null; postalCode: string | null; country: string; isDefault: boolean | null }
const [{ data: methods }, { data: paymentMethods, refresh: refreshPaymentMethods }, { data: addresses }, { data: loyalty }] = await Promise.all([
  useFetch('/api/store/shipping-methods', { key: 'shipping-methods' }),
  // Which ones fit depends on whether the cart has something to ship
  useFetch('/api/store/payment-methods', { key: 'payment-methods' }),
  // Members only
  useAsyncData('addresses', async () => (user.value ? ((await requestFetch('/api/store/addresses')) as Address[]) : [])),
  useAsyncData('loyalty', async () => (user.value ? await requestFetch('/api/store/loyalty') : null)),
  // Whether it ships decides what the summary is asked for
  cartLoaded,
])

const state = reactive({
  name: '',
  email: '',
  phone: '',
  // A saved address's id, or 'new'
  addressId: (addresses.value?.find((a) => a.isDefault) ?? addresses.value?.[0])?.id ?? ('new' as number | 'new'),
  address: emptyAddress(),
  saveAddress: true,
  // The cheapest to start with
  shippingMethodId: [...(methods.value ?? [])].sort((a, b) => Number(a.price) - Number(b.price))[0]?.id as number | undefined,
  points: 0,
  paymentMethod: paymentMethods.value?.[0]?.id,
})

// False when nothing in the cart is shipped
const ships = computed(() => cart.value?.requiresShipping !== false)
watch(ships, () => refreshPaymentMethods())
watch(paymentMethods, (list) => {
  if (!list?.some((m) => m.id === state.paymentMethod)) state.paymentMethod = list?.[0]?.id
})
// A membership in the cart needs an account
const needsSignIn = computed(() => Boolean(cart.value?.requiresAccount) && !user.value)

// The points previewed in the summary, set when the field is left
const appliedPoints = ref(0)
const canRedeem = computed(() => Boolean(loyalty.value?.canRedeem && loyalty.value.points > 0))

// The summary with the chosen delivery and points: its total is what the
// order is placed for
const summaryQuery = computed(() => ({
  shippingMethodId: ships.value ? state.shippingMethodId : undefined,
  redeemPoints: appliedPoints.value > 0 ? appliedPoints.value : undefined,
}))
const { data: summary, error: summaryError, refresh: refreshSummary } = await useFetch('/api/store/cart', {
  key: 'checkout-summary',
  query: summaryQuery,
})
const pointsError = computed(() => (summaryError.value && appliedPoints.value ? cartErrorMessage(summaryError.value) : ''))
const blocked = computed(() => (summary.value?.lines ?? []).some((line) => lineProblem(line)))
const offers = computed(() => [
  ...(summary.value?.siteOfferDiscounts ?? []),
  ...(summary.value?.userOfferDiscounts ?? []),
  ...(summary.value?.voucherOfferDiscounts ?? []),
])

// ---- choices
const addressItems = computed(() => [
  ...(addresses.value ?? []).map((a) => ({
    label: addressLine(a),
    value: a.id,
  })),
  { label: 'A new address', value: 'new' as const },
])
const methodItems = computed(() =>
  (methods.value ?? []).map((m) => ({ label: m.name, description: Number(m.price) ? money(m.price) : 'Free', value: m.id })),
)
const paymentItems = computed(() =>
  (paymentMethods.value ?? []).map((m) => ({ label: m.label, description: m.description ?? undefined, value: m.id })),
)
const newAddress = computed(() => state.addressId === 'new')

// ---- checking the form
const validate = () => {
  const errors: { name: string; message: string }[] = []
  const need = (name: keyof typeof state, message: string) => {
    if (!String(state[name] ?? '').trim()) errors.push({ name, message })
  }
  if (!user.value && !needsSignIn.value) {
    need('name', 'Enter your name')
    if (!state.email.trim()) errors.push({ name: 'email', message: 'Enter your email' })
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) errors.push({ name: 'email', message: 'Enter a valid email' })
  }
  if (ships.value && newAddress.value) errors.push(...addressErrors(state.address))
  if (ships.value && methodItems.value.length && !state.shippingMethodId) errors.push({ name: 'shippingMethodId', message: 'Choose a delivery method' })
  return errors
}

// ---- placing the order
const placing = ref(false)
// A problem placing the order; `cart` when the cart needs changes first
const problem = ref<{ message: string; cart?: boolean } | null>(null)
type ApiError = { data?: { message?: string; data?: { code?: string; actualTotal?: string } } }


let leaving = false
const place = async () => {
  if (!summary.value) return
  placing.value = true
  problem.value = null
  try {
    const order = await $fetch('/api/store/checkout', {
      method: 'POST',
      body: {
        shippingMethodId: summaryQuery.value.shippingMethodId,
        expectedTotal: summary.value.total,
        ...(!ships.value ? {} : newAddress.value ? { shippingAddress: addressBody(state.address) } : { shippingAddressId: state.addressId as number }),
        guestUser: user.value ? undefined : { name: state.name.trim(), email: state.email.trim(), phone: state.phone.trim() || undefined },
        redeemPoints: appliedPoints.value > 0 ? appliedPoints.value : undefined,
        paymentMethod: state.paymentMethod,
      },
    })
    // Saved once the order is placed; a failure here does not undo the order
    if (user.value && ships.value && newAddress.value && state.saveAddress) {
      // The first one saved becomes the default, as on the account's addresses
      const body = { ...addressBody(state.address), isDefault: !addresses.value?.length }
      await $fetch('/api/store/addresses', { method: 'POST', body }).catch(() => {})
    }
    // To the gateway to pay, and back to the order page after. The page stays
    // as it is meanwhile.
    if (order.payment.redirectUrl) {
      leaving = true
      await navigateTo(order.payment.redirectUrl, { external: true })
      return
    }
    await refreshCart()
    await navigateTo(`/orders/${order.id}?hash=${encodeURIComponent(order.hash)}`)
  } catch (error) {
    const data = (error as ApiError).data
    if (data?.data?.code === 'OrderTotalMismatchError') {
      await refreshSummary()
      problem.value = { message: `Your total changed to ${money(data.data.actualTotal)}. Check it, then place the order again.` }
    } else {
      await refreshSummary()
      problem.value = { message: data?.message ?? 'Your order could not be placed. Please try again.', cart: Boolean(data?.data?.code) || blocked.value }
    }
  } finally {
    if (!leaving) placing.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 lg:py-14">
    <h1 class="text-4xl font-medium tracking-tight sm:text-5xl">Checkout</h1>

    <div v-if="!cart?.lines.length && !placing" class="flex flex-col items-start gap-5 py-16">
      <p class="text-lg text-muted">Your cart is empty.</p>
      <UButton to="/" label="Continue shopping" trailing-icon="i-lucide-arrow-right" />
    </div>

    <UForm v-else :state="state" :validate="validate" :validate-on="[]" class="mt-10 grid gap-12 lg:grid-cols-[1fr_26rem]" @submit="place">
      <div class="space-y-10">
        <section class="space-y-4" aria-labelledby="contact">
          <h2 id="contact" class="text-2xl font-medium">Contact</h2>
          <p v-if="user" class="text-muted">Signed in as {{ user.email }}</p>
          <UAlert
            v-else-if="needsSignIn"
            color="neutral"
            variant="subtle"
            icon="i-lucide-user-round"
            title="Sign in to buy a membership"
            description="A membership belongs to your account, so it needs one."
            :actions="[{ label: 'Sign in', to: '/login?redirect=/checkout', color: 'neutral' }]"
          />
          <template v-else>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Name" name="name" required>
                <UInput v-model="state.name" autocomplete="name" size="lg" class="w-full" />
              </UFormField>
              <UFormField label="Email" name="email" required>
                <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Phone" name="phone" hint="Optional" :help="ships ? 'For the courier, if they need to reach you' : undefined">
              <UInput v-model="state.phone" type="tel" autocomplete="tel" size="lg" class="w-full sm:w-1/2" />
            </UFormField>
            <p class="text-sm text-muted">
              Have an account? <NuxtLink to="/login?redirect=/checkout" class="underline">Sign in</NuxtLink> to use your saved addresses and points.
            </p>
          </template>
        </section>

        <section v-if="ships" class="space-y-4" aria-labelledby="address">
          <h2 id="address" class="text-2xl font-medium">Delivery address</h2>
          <URadioGroup v-if="addresses?.length" v-model="state.addressId" :items="addressItems" variant="table" aria-label="Delivery address" />
          <AddressFields v-if="newAddress" v-model="state.address">
            <UCheckbox v-if="user" v-model="state.saveAddress" label="Save this address for next time" class="sm:col-span-2" />
          </AddressFields>
        </section>

        <section v-if="ships && methodItems.length" class="space-y-4" aria-labelledby="delivery">
          <h2 id="delivery" class="text-2xl font-medium">Delivery method</h2>
          <UFormField name="shippingMethodId">
            <URadioGroup v-model="state.shippingMethodId" :items="methodItems" variant="table" aria-label="Delivery method" />
          </UFormField>
        </section>

        <section v-if="canRedeem" class="space-y-4" aria-labelledby="points">
          <h2 id="points" class="text-2xl font-medium">Loyalty points</h2>
          <p class="text-sm text-muted">You have {{ loyalty!.points }} points, worth {{ money(loyalty!.value) }}.</p>
          <UFormField label="Points to use" :error="pointsError || undefined">
            <UInputNumber v-model="state.points" :min="0" :max="loyalty!.points" size="lg" class="w-40" @blur="appliedPoints = state.points || 0" />
          </UFormField>
        </section>

        <section class="space-y-4" aria-labelledby="payment">
          <h2 id="payment" class="text-2xl font-medium">Payment</h2>
          <URadioGroup v-if="paymentItems.length" v-model="state.paymentMethod" :items="paymentItems" variant="table" aria-label="Payment" />
          <p v-else class="text-muted">Payments are not set up yet, so orders cannot be placed. Please try again later.</p>
        </section>
      </div>

      <aside aria-label="Order summary" class="h-fit space-y-6 rounded-sm bg-muted p-6 lg:sticky lg:top-24">
        <h2 class="text-2xl font-medium">Summary</h2>
        <ul class="divide-y divide-default">
          <li v-for="line in summary?.lines" :key="line.id" class="flex gap-3 py-3 text-sm">
            <div class="relative size-14 shrink-0 overflow-hidden rounded-sm bg-elevated">
              <img v-if="line.variant.image?.imageUrl ?? line.variant.product.thumbnail" :src="(line.variant.image?.imageUrl ?? line.variant.product.thumbnail)!" alt="" class="size-full object-cover">
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ line.variant.product.name }}</p>
              <p class="text-muted">
                {{ [...line.variant.options.map((o) => o.value), `× ${line.quantity}`].join(' · ') }}
              </p>
              <p v-if="lineProblem(line)" class="text-error">{{ lineProblem(line) }}</p>
            </div>
            <p class="font-serif">{{ money(Number(line.variant.discountedPrice ?? line.variant.price) * line.quantity) }}</p>
          </li>
        </ul>

        <dl v-if="summary" class="space-y-3 text-sm">
          <div class="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{{ money(summary.subtotal) }}</dd>
          </div>
          <div v-for="offer in offers" :key="`offer-${offer.id}`" class="flex justify-between gap-2">
            <dt class="min-w-0 break-all">{{ 'voucherCode' in offer ? `Voucher ${offer.voucherCode}` : offer.name }}</dt>
            <dd class="whitespace-nowrap">−{{ money(offer.discount) }}</dd>
          </div>
          <div v-if="Number(summary.loyaltyDiscount) > 0" class="flex justify-between">
            <dt>Points</dt>
            <dd class="whitespace-nowrap">−{{ money(summary.loyaltyDiscount) }}</dd>
          </div>
          <div v-if="ships" class="flex justify-between">
            <dt>Delivery</dt>
            <dd>{{ state.shippingMethodId ? (Number(summary.shippingCharge) ? money(summary.shippingCharge) : 'Free') : '–' }}</dd>
          </div>
          <div v-if="!summary.pricesIncludeTax" class="flex justify-between">
            <dt>Tax</dt>
            <dd>{{ money(summary.tax) }}</dd>
          </div>
          <div class="flex justify-between border-t border-default pt-3 text-base">
            <dt class="font-medium">Total</dt>
            <dd class="font-serif text-xl" data-testid="checkout-total">{{ money(summary.total) }}</dd>
          </div>
          <p v-if="summary.pricesIncludeTax && Number(summary.tax) > 0" class="text-xs text-muted">Includes {{ money(summary.tax) }} tax</p>
        </dl>

        <UAlert
          v-if="problem"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="problem.message"
          :actions="problem.cart ? [{ label: 'Review your cart', to: '/cart', color: 'error', variant: 'outline' }] : undefined"
        />
        <UAlert
          v-else-if="blocked"
          color="error"
          variant="subtle"
          title="Some items need changes before you can order."
          :actions="[{ label: 'Review your cart', to: '/cart', color: 'error', variant: 'outline' }]"
        />

        <UButton
          type="submit"
          size="xl"
          block
          :loading="placing"
          :disabled="blocked || !summary || needsSignIn || !state.paymentMethod"
          :label="summary ? `Place order · ${money(summary.total)}` : 'Place order'"
        />
      </aside>
    </UForm>
  </UContainer>
</template>
