<script setup lang="ts">
// The featured offers on the home page, a card each: image, name,
// description, what it gives, the voucher code to copy, and when it ends
type Offer = {
  id: number
  name: string
  description: string | null
  image: string | null
  type: 'site' | 'user' | 'voucher'
  voucherCode: string | null
  endDate: string | null
  benefit: { type: 'percentage' | 'fixed_amount' | 'fixed_price' | 'free_shipping'; value: string }
}
defineProps<{ offers: Offer[] }>()
const money = useMoney()
const toast = useToast()
const { data: settings } = useStoreSettings()
const day = (value: string) => new Intl.DateTimeFormat(settings.value?.locale ?? 'en-US', { dateStyle: 'medium' }).format(new Date(value))

// "20% off", "$5.00 off each", "Now $10.00", "Free shipping"
const benefit = ({ type, value }: Offer['benefit']) =>
  type === 'percentage' ? `${trimDecimal(value)}% off` : type === 'fixed_amount' ? `${money(value)} off each` : type === 'fixed_price' ? `Now ${money(value)}` : 'Free shipping'

const copy = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code)
    toast.add({ title: `Copied ${code}`, description: 'Enter it in your cart.', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: `Your code is ${code}`, description: 'Enter it in your cart.', icon: 'i-lucide-ticket' })
  }
}
const id = useId()
</script>

<template>
  <section v-if="offers.length" :aria-labelledby="id" class="py-12">
    <UContainer>
      <h2 :id="id" class="mb-8 text-3xl font-medium tracking-tight">Offers</h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="offer in offers" :key="offer.id" class="overflow-hidden rounded-sm bg-muted" role="group" :aria-label="offer.name">
          <img v-if="offer.image" :src="offer.image" alt="" loading="lazy" class="aspect-video w-full object-cover">
          <div class="space-y-3 p-6">
            <p class="font-sans text-xs font-medium tracking-wider text-muted uppercase">{{ benefit(offer.benefit) }}</p>
            <div>
              <p class="font-serif text-xl text-highlighted">{{ offer.name }}</p>
              <p v-if="offer.description" class="text-sm text-muted">{{ offer.description }}</p>
            </div>
            <UButton
              v-if="offer.voucherCode"
              :label="offer.voucherCode"
              :aria-label="`Copy code ${offer.voucherCode}`"
              color="neutral"
              variant="outline"
              size="sm"
              trailing-icon="i-lucide-copy"
              class="font-mono"
              @click="copy(offer.voucherCode)"
            />
            <p v-if="offer.endDate" class="text-xs text-muted">Ends {{ day(offer.endDate) }}</p>
          </div>
        </li>
      </ul>
    </UContainer>
  </section>
</template>
