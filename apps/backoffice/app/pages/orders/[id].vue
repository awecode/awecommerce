<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import CancelOrderModal from '~/components/orders/CancelOrderModal.vue'

// One order: items and totals, the customer, delivery and payment, its
// history, and the actions: the usual next status, other statuses, payment
// status and cancelling
const route = useRoute()
const toast = useToast()
const money = useMoney()
const queryCache = useQueryCache()
const { data: store } = useStoreSettings()
const cancelModal = useOverlay().create(CancelOrderModal)

const id = computed(() => Number(route.params.id))
const { data: order, error } = useQuery({
  key: () => ['order', id.value],
  query: () => $fetch(`/api/admin/orders/${id.value}`),
})
useSeoMeta({ title: () => `Order #${id.value}` })

// Paths with an id are only known at run time
const api = $fetch as (url: string, options?: Record<string, unknown>) => Promise<unknown>

const busy = ref(false)
const act = async (action: () => Promise<unknown>, done: string) => {
  busy.value = true
  try {
    await action()
    toast.add({ title: done, color: 'success', icon: 'i-lucide-check' })
  } catch (error) {
    toast.add({ title: 'Could not change the order', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    busy.value = false
    await queryCache.invalidateQueries({ key: ['order', id.value] })
    await queryCache.invalidateQueries({ key: ['orders'] })
  }
}
const setStatus = (status: OrderStatus) =>
  act(() => api(`/api/admin/orders/${id.value}/status`, { method: 'POST', body: { status } }), `Order #${id.value} is ${status}`)
const setPayment = (paymentStatus: string) =>
  act(() => api(`/api/admin/orders/${id.value}/payment-status`, { method: 'POST', body: { paymentStatus } }), `Payment is ${paymentStatus}`)
const cancel = async () => {
  const answer = await cancelModal.open({ orderId: id.value }).result
  if (answer) await act(() => api(`/api/admin/orders/${id.value}/cancel`, { method: 'POST', body: answer }), `Order #${id.value} cancelled`)
}

const status = computed(() => order.value?.status as OrderStatus | undefined)
const open = computed(() => status.value && status.value !== 'Cancelled')
const next = computed(() => (status.value ? nextStep[status.value] : undefined))
const menu = computed<DropdownMenuItem[][]>(() => [
  orderStatuses
    .filter((s) => s !== status.value && s !== next.value?.status)
    .map((s) => ({ label: `Move to ${s}`, onSelect: () => setStatus(s) })),
  [{ label: 'Cancel order', icon: 'i-lucide-ban', color: 'error' as const, onSelect: cancel }],
])

// ---- what the page shows
const dateTime = computed(() => new Intl.DateTimeFormat(store.value?.locale ?? 'en-US', { dateStyle: 'medium', timeStyle: 'short' }))
type Line = NonNullable<typeof order.value>['lines'][number]
const unit = (line: Line) => Number(line.price ?? 0) - Number(line.discount)
const subtotal = computed(() => (order.value?.lines ?? []).reduce((total, line) => total + unit(line) * line.quantity, 0))
const address = computed(() => {
  const a = (order.value?.shippingAddress ?? {}) as Record<string, string>
  return [a.line1, a.line2, a.houseNo, [a.city, a.province].filter(Boolean).join(', '), a.postalCode, a.country].filter(Boolean)
})
const instructions = computed(() => (order.value?.shippingAddress as Record<string, string> | null)?.instructions)
const offers = computed(() => (order.value?.offers ?? []) as { id: number; name: string; discount: number; voucherCode?: string }[])
const paymentMethod = computed(() => {
  const method = (order.value?.metadata as { paymentMethod?: string } | null)?.paymentMethod
  return method ? (paymentMethods[method] ?? method) : null
})
const phone = computed(() => (order.value?.guestUser as { phone?: string } | null)?.phone)
</script>

<template>
  <UDashboardPanel id="order">
    <template #header>
      <UDashboardNavbar :title="`Order #${id}`">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/orders" aria-label="Back to orders" />
        </template>
        <template v-if="order" #trailing>
          <UBadge data-testid="order-status" :label="order.status" :color="statusColor[status!]" variant="subtle" />
          <UBadge data-testid="payment-status" :label="`Payment ${order.paymentStatus}`" :color="paymentColor[order.paymentStatus]" variant="outline" />
        </template>
        <template v-if="order && open" #right>
          <UButton v-if="next" :label="next.label" :loading="busy" @click="setStatus(next.status)" />
          <UDropdownMenu :items="menu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" aria-label="More actions" :disabled="busy" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="error"
        icon="i-lucide-receipt"
        :title="isNotFound(error) ? 'No such order' : 'This order could not be loaded'"
        :description="isNotFound(error) ? undefined : apiErrorMessage(error)"
        :actions="[{ label: 'Back to orders', to: '/orders', color: 'neutral', variant: 'outline' }]"
        class="m-auto"
      />
      <div v-else-if="order" class="@container">
        <div class="mx-auto flex max-w-6xl flex-col gap-8 @4xl:flex-row">
          <div class="min-w-0 flex-1 space-y-8">
            <UAlert
              v-if="order.status === 'Cancelled'"
              color="error"
              variant="subtle"
              icon="i-lucide-ban"
              :title="`Cancelled ${order.cancelledAt ? dateTime.format(new Date(order.cancelledAt)) : ''}`"
              :description="[order.cancellationReason, order.cancellationRemarks].filter(Boolean).join('. ')"
            />

            <section aria-labelledby="items" class="space-y-3">
              <h2 id="items" class="text-sm font-semibold text-highlighted">Items</h2>
              <div class="overflow-hidden rounded-md border border-default">
                <table class="w-full text-sm">
                  <thead class="bg-elevated/40 text-xs text-muted">
                    <tr class="[&>th]:px-3 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                      <th>Product</th>
                      <th>SKU</th>
                      <th class="text-right!">Price</th>
                      <th class="text-right!">Qty</th>
                      <th class="text-right!">Total</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr v-for="line in order.lines" :key="line.id" class="align-top [&>td]:px-3 [&>td]:py-2">
                      <td>
                        <div class="flex gap-3">
                          <UAvatar :src="line.imageUrl ?? undefined" icon="i-lucide-image" size="md" class="rounded" />
                          <div class="min-w-0">
                            <NuxtLink :to="`/products/${line.productId}`" class="font-medium text-highlighted hover:underline">{{ line.productName }}</NuxtLink>
                            <p v-for="o in line.options" :key="o.name" class="text-xs text-muted">{{ o.name }}: {{ o.value }}</p>
                            <p v-for="(answer, label) in line.customizations" :key="label" class="text-xs text-muted">{{ label }}: {{ answer }}</p>
                          </div>
                        </div>
                      </td>
                      <td class="font-mono text-xs text-muted">{{ line.sku }}</td>
                      <td class="text-right tabular-nums">
                        {{ money(unit(line)) }}
                        <s v-if="Number(line.discount) > 0" class="block text-xs text-muted">{{ money(line.price) }}</s>
                      </td>
                      <td class="text-right tabular-nums">{{ line.quantity }}</td>
                      <td class="text-right tabular-nums">{{ money(unit(line) * line.quantity) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <dl class="ml-auto max-w-xs space-y-1.5 text-sm">
                <div class="flex justify-between"><dt class="text-muted">Subtotal</dt><dd class="tabular-nums">{{ money(subtotal) }}</dd></div>
                <div v-for="offer in offers" :key="offer.id" class="flex justify-between gap-3">
                  <dt class="text-muted">{{ offer.voucherCode ? `Voucher ${offer.voucherCode}` : offer.name }}</dt>
                  <dd class="tabular-nums whitespace-nowrap">−{{ money(offer.discount) }}</dd>
                </div>
                <div v-if="Number(order.loyaltyDiscount) > 0" class="flex justify-between"><dt class="text-muted">Points</dt><dd class="tabular-nums">−{{ money(order.loyaltyDiscount) }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted">Delivery</dt><dd class="tabular-nums">{{ money(order.shippingCharge) }}</dd></div>
                <div v-if="Number(order.tax) > 0" class="flex justify-between"><dt class="text-muted">Tax</dt><dd class="tabular-nums">{{ money(order.tax) }}</dd></div>
                <div class="flex justify-between border-t border-default pt-1.5 font-medium text-highlighted">
                  <dt>Total</dt><dd data-testid="order-total" class="tabular-nums">{{ money(order.total) }}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="history" class="space-y-3" role="region" aria-label="History">
              <h2 id="history" class="text-sm font-semibold text-highlighted">History</h2>
              <ol class="space-y-3 border-l border-default pl-4">
                <li v-for="log in [...order.logs].reverse()" :key="log.id" class="relative text-sm">
                  <span class="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-(--ui-border-accented)" />
                  <p class="text-highlighted">{{ log.log }}</p>
                  <p class="text-xs text-muted">
                    {{ dateTime.format(new Date(log.createdAt)) }}<template v-if="log.loggedByEmail"> · {{ log.loggedByEmail }}</template>
                  </p>
                </li>
              </ol>
            </section>
          </div>

          <aside class="space-y-6 text-sm @4xl:w-72 @4xl:shrink-0">
            <section aria-labelledby="customer" class="space-y-1">
              <h2 id="customer" class="text-xs font-medium text-muted">Customer</h2>
              <template v-if="order.customer">
                <p class="flex items-center gap-2 text-highlighted">
                  {{ order.customer.name || order.customer.email }}
                  <UBadge :label="order.customer.guest ? 'Guest' : 'Member'" color="neutral" variant="outline" />
                </p>
                <p class="text-muted">{{ order.customer.email }}</p>
                <p v-if="phone" class="text-muted">{{ phone }}</p>
                <UButton :to="{ path: '/orders', query: { view: 'all', q: order.customer.email } }" label="Their orders" color="neutral" variant="link" class="px-0" />
              </template>
              <p v-else class="text-muted">Unknown</p>
            </section>
            <section aria-labelledby="ship-to" class="space-y-1">
              <h2 id="ship-to" class="text-xs font-medium text-muted">Delivery address</h2>
              <p v-for="part in address" :key="part">{{ part }}</p>
              <p v-if="instructions" class="text-muted italic">{{ instructions }}</p>
            </section>
            <section aria-labelledby="delivery" class="space-y-1">
              <h2 id="delivery" class="text-xs font-medium text-muted">Delivery method</h2>
              <p>{{ (order.shippingMethod as { name?: string } | null)?.name ?? 'None' }}</p>
            </section>
            <section aria-labelledby="payment" class="space-y-2">
              <h2 id="payment" class="text-xs font-medium text-muted">Payment</h2>
              <p>{{ paymentMethod ?? 'Not recorded' }}</p>
              <div v-if="open" class="flex flex-wrap gap-2">
                <UButton v-if="order.paymentStatus !== 'Paid'" label="Mark as paid" color="neutral" variant="outline" :disabled="busy" @click="setPayment('Paid')" />
                <UButton v-if="order.paymentStatus === 'Paid'" label="Mark as refunded" color="neutral" variant="outline" :disabled="busy" @click="setPayment('Refunded')" />
              </div>
            </section>
            <section aria-labelledby="placed" class="space-y-1">
              <h2 id="placed" class="text-xs font-medium text-muted">Placed</h2>
              <p>{{ dateTime.format(new Date(order.createdAt)) }}</p>
            </section>
          </aside>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
