<script setup lang="ts">
// The full cart: its lines, what stops checkout, vouchers and the totals
useSeoMeta({ title: 'Your cart', robots: 'noindex' })

const { cart, count, applyVoucher, removeVoucher } = useCart()
const money = useMoney()
const toast = useToast()

const blocked = computed(() => (cart.value?.lines ?? []).some((line) => lineProblem(line)))
const offers = computed(() => [...(cart.value?.siteOfferDiscounts ?? []), ...(cart.value?.userOfferDiscounts ?? [])])

// ---- vouchers
const code = ref('')
const voucherError = ref('')
const applying = ref(false)
const apply = async () => {
  if (!code.value.trim()) return
  applying.value = true
  voucherError.value = ''
  try {
    await applyVoucher(code.value.trim())
    code.value = ''
  } catch (error) {
    voucherError.value = cartErrorMessage(error)
  } finally {
    applying.value = false
  }
}
const remove = async (voucherCode: string) => {
  try {
    await removeVoucher(voucherCode)
  } catch (error) {
    toast.add({ title: cartErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <UContainer class="py-10 lg:py-14">
    <h1 class="text-4xl font-medium tracking-tight sm:text-5xl">Your cart</h1>

    <div v-if="!cart?.lines.length" class="flex flex-col items-start gap-5 py-16">
      <p class="text-lg text-muted">Your cart is empty.</p>
      <UButton to="/" label="Continue shopping" trailing-icon="i-lucide-arrow-right" />
    </div>

    <div v-else class="mt-10 grid gap-12 lg:grid-cols-[1fr_24rem]">
      <section aria-label="Items">
        <p class="border-b border-default pb-4 text-sm text-muted">{{ count }} item{{ count === 1 ? '' : 's' }}</p>
        <ul class="divide-y divide-default border-b border-default">
          <CartLineItem v-for="line in cart.lines" :key="line.id" :line="line" />
        </ul>
      </section>

      <aside aria-label="Order summary" class="h-fit space-y-6 rounded-sm bg-muted p-6 lg:sticky lg:top-24">
        <h2 class="text-2xl font-medium">Summary</h2>

        <form class="space-y-2" @submit.prevent="apply">
          <div class="flex gap-2">
            <UInput v-model="code" placeholder="Voucher code" aria-label="Voucher code" class="flex-1" :color="voucherError ? 'error' : undefined" :highlight="Boolean(voucherError)" />
            <UButton type="submit" label="Apply" color="neutral" variant="outline" :loading="applying" />
          </div>
          <p v-if="voucherError" class="text-sm text-error">{{ voucherError }}</p>
        </form>

        <dl class="space-y-3 text-sm">
          <div class="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{{ money(cart.subtotal) }}</dd>
          </div>
          <div v-for="offer in offers" :key="`offer-${offer.id}`" class="flex justify-between">
            <dt>{{ offer.name }}</dt>
            <dd class="whitespace-nowrap">−{{ money(offer.discount) }}</dd>
          </div>
          <div v-for="voucher in cart.voucherOfferDiscounts" :key="`voucher-${voucher.id}`" class="flex items-center justify-between gap-2">
            <dt class="flex min-w-0 items-center gap-1 break-all">
              Voucher {{ voucher.voucherCode }}
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Remove voucher ${voucher.voucherCode}`" @click="remove(voucher.voucherCode)" />
            </dt>
            <dd class="whitespace-nowrap">−{{ money(voucher.discount) }}</dd>
          </div>
          <div class="flex justify-between text-muted">
            <dt>Shipping</dt>
            <dd>{{ cart.requiresShipping ? 'At checkout' : 'Nothing to ship' }}</dd>
          </div>
          <div v-if="!cart.pricesIncludeTax" class="flex justify-between">
            <dt>Tax</dt>
            <dd>{{ money(cart.tax) }}</dd>
          </div>
          <div class="flex justify-between border-t border-default pt-3 text-base">
            <dt class="font-medium">Total</dt>
            <dd class="font-serif text-xl" data-testid="cart-total">{{ money(cart.total) }}</dd>
          </div>
          <p v-if="cart.pricesIncludeTax && Number(cart.tax) > 0" class="text-xs text-muted">Includes {{ money(cart.tax) }} tax</p>
        </dl>

        <div class="space-y-2">
          <UButton to="/checkout" label="Checkout" size="xl" block :disabled="blocked" />
          <p v-if="blocked" class="text-sm text-error">Fix the items marked above to check out.</p>
        </div>
      </aside>
    </div>
  </UContainer>
</template>
