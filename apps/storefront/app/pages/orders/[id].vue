<script setup lang="ts">
// An order: right after checkout (with the `hash` from checkout, so the link
// works for whoever has it), or from the buyer's account (signed in, no hash).
// An order with nothing to ship has no delivery; its lines show the
// fulfilment notes (a download link, what happens next). An unpaid order with
// an online payment method offers Pay now (see OrderPayNow).
definePageMeta({
  // Without the link's hash, only its owner can see it: sign in first
  middleware: (to) => {
    if (!to.query.hash && !useAuth().loggedIn.value) {
      return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
    }
  },
})
const route = useRoute()
const money = useMoney()
const { user } = useAuth()
const settings = useStoreSettings()

const hash = route.query.hash as string | undefined
const { data: order, error, refresh } = await useFetch(() => `/api/store/orders/${route.params.id}`, { query: { hash } })
if (error.value || !order.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useSeoMeta({ title: () => `Order ${order.value?.id}`, robots: 'noindex' })

const lines = computed(() => order.value?.lines ?? [])
// Each line's price less its own discount, for its quantity
const lineTotal = (line: (typeof lines.value)[number]) => (Number(line.price ?? 0) - Number(line.discount)) * line.quantity
const subtotal = computed(() => lines.value.reduce((total, line) => total + lineTotal(line), 0))
const ships = computed(() => lines.value.some((line) => line.requiresShipping))
const email = computed(() => (order.value?.guestUser as { email?: string } | null)?.email ?? user.value?.email)
const address = computed(() => {
  const a = (order.value?.shippingAddress ?? {}) as Record<string, string>
  return [a.line1, a.line2, [a.city, a.province].filter(Boolean).join(', '), a.postalCode, a.country].filter(Boolean)
})
const payment = computed(() => order.value?.payment.method ?? null)
const placedOn = computed(() =>
  order.value ? new Intl.DateTimeFormat(settings.value?.locale ?? 'en-US', { dateStyle: 'long' }).format(new Date(order.value.createdAt)) : '',
)
</script>

<template>
  <UContainer v-if="order" class="max-w-4xl py-10 lg:py-14">
    <UButton v-if="!hash" to="/account/orders" label="All orders" icon="i-lucide-arrow-left" color="neutral" variant="link" class="mb-6 px-0" />
    <div class="space-y-3">
      <p class="text-sm tracking-wider text-muted uppercase">Order {{ order.id }} · {{ placedOn }}</p>
      <h1 class="text-4xl font-medium tracking-tight sm:text-5xl">{{ hash ? 'Thank you for your order' : `Order ${order.id}` }}</h1>
      <p v-if="hash" class="max-w-2xl text-muted text-pretty">
        Your order is placed<template v-if="email"> for {{ email }}</template>. Keep this page's link to check on it.
      </p>
      <div class="flex flex-wrap gap-2 pt-1">
        <UBadge :label="order.status" color="neutral" variant="subtle" />
        <UBadge :label="`Payment ${order.paymentStatus.toLowerCase()}`" color="neutral" variant="outline" />
      </div>
    </div>

    <OrderPayNow v-if="order.payment.canPay" :key="order.updatedAt" :order-id="order.id" :hash="hash" :payment="order.payment" class="mt-10" @changed="refresh()" />

    <div class="mt-10 grid gap-10 sm:grid-cols-3">
      <section v-if="ships" aria-labelledby="ship-to">
        <h2 id="ship-to" class="mb-2 font-sans text-xs font-medium tracking-wider text-muted uppercase">Delivery address</h2>
        <p v-for="part in address" :key="part">{{ part }}</p>
        <p v-if="(order.shippingAddress as Record<string, string>)?.instructions" class="mt-1 text-sm text-muted">
          {{ (order.shippingAddress as Record<string, string>).instructions }}
        </p>
      </section>
      <section v-if="ships" aria-labelledby="delivery">
        <h2 id="delivery" class="mb-2 font-sans text-xs font-medium tracking-wider text-muted uppercase">Delivery</h2>
        <p>{{ (order.shippingMethod as { name?: string })?.name ?? 'Standard' }}</p>
      </section>
      <section v-if="payment" aria-labelledby="payment">
        <h2 id="payment" class="mb-2 font-sans text-xs font-medium tracking-wider text-muted uppercase">Payment</h2>
        <p>{{ payment.label }}</p>
        <p v-if="!payment.online && payment.description && order.paymentStatus === 'Pending'" class="text-sm text-muted">{{ payment.description }}</p>
      </section>
    </div>

    <section class="mt-12" aria-labelledby="items">
      <h2 id="items" class="mb-2 text-2xl font-medium">Items</h2>
      <ul class="divide-y divide-default border-y border-default">
        <li v-for="line in lines" :key="line.id" class="flex gap-4 py-5">
          <div class="size-20 shrink-0 overflow-hidden rounded-sm bg-elevated">
            <AppImage v-if="line.imageUrl" :src="line.imageUrl" :alt="line.productName" :width="160" :height="160" class="size-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ line.productName }}</p>
            <p v-for="o in line.options" :key="o.name" class="text-sm text-muted">{{ o.name }}: {{ o.value }}</p>
            <p v-for="(answer, label) in line.customizations" :key="label" class="text-sm text-muted">{{ label }}: {{ answer }}</p>
            <p class="text-sm text-muted">Quantity {{ line.quantity }}</p>
            <div v-if="line.note" class="mt-3 space-y-1 rounded-sm bg-muted p-3 text-sm">
              <p class="font-medium">{{ line.note.title }}</p>
              <p class="text-muted">{{ line.note.text }}</p>
              <UButton v-if="line.note.link" :to="line.note.link.url" :label="line.note.link.label" target="_blank" size="sm" variant="link" class="px-0" trailing-icon="i-lucide-arrow-up-right" />
            </div>
          </div>
          <p class="font-serif">{{ money(lineTotal(line)) }}</p>
        </li>
      </ul>

      <dl class="ml-auto mt-6 max-w-sm space-y-3 text-sm">
        <div class="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{{ money(subtotal) }}</dd>
        </div>
        <div v-if="Number(order.discount) > 0" class="flex justify-between">
          <dt>Discounts</dt>
          <dd>−{{ money(order.discount) }}</dd>
        </div>
        <div v-if="Number(order.loyaltyDiscount) > 0" class="flex justify-between">
          <dt>Points</dt>
          <dd>−{{ money(order.loyaltyDiscount) }}</dd>
        </div>
        <div v-if="ships" class="flex justify-between">
          <dt>Delivery</dt>
          <dd>{{ Number(order.shippingCharge) ? money(order.shippingCharge) : 'Free' }}</dd>
        </div>
        <div v-if="Number(order.tax) > 0" class="flex justify-between">
          <dt>Tax</dt>
          <dd>{{ money(order.tax) }}</dd>
        </div>
        <div class="flex justify-between border-t border-default pt-3 text-base">
          <dt class="font-medium">Total</dt>
          <dd class="font-serif text-xl" data-testid="order-total">{{ money(order.total) }}</dd>
        </div>
      </dl>
    </section>

    <div class="mt-12">
      <UButton to="/" label="Continue shopping" trailing-icon="i-lucide-arrow-right" />
    </div>
  </UContainer>
</template>
