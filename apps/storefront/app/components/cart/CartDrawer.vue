<script setup lang="ts">
// The cart sliding in from the side: it opens after adding to the cart and
// from the header's cart button
const { cart, count, drawerOpen } = useCart()
const money = useMoney()
const blocked = computed(() => (cart.value?.lines ?? []).some((line) => lineProblem(line)))

// Closes when the buyer follows a link out of it
const route = useRoute()
watch(() => route.fullPath, () => (drawerOpen.value = false))
</script>

<template>
  <USlideover v-model:open="drawerOpen" :title="`Your cart (${count})`" :ui="{ content: 'max-w-md', body: 'py-0 sm:py-0' }">
    <template #body>
      <ul v-if="cart?.lines.length" class="divide-y divide-default">
        <CartLineItem v-for="line in cart.lines" :key="line.id" :line="line" compact />
      </ul>
      <div v-else class="flex flex-col items-center gap-4 py-20 text-center">
        <p class="text-muted">Your cart is empty</p>
        <UButton label="Continue shopping" color="neutral" variant="outline" @click="drawerOpen = false" />
      </div>
    </template>
    <template v-if="cart?.lines.length" #footer>
      <div class="w-full space-y-4">
        <div class="flex justify-between">
          <span>Subtotal</span>
          <span class="font-serif">{{ money(cart.subtotal) }}</span>
        </div>
        <div v-if="Number(cart.totalOfferDiscount) > 0" class="flex justify-between text-sm">
          <span>Discounts</span>
          <span>−{{ money(cart.totalOfferDiscount) }}</span>
        </div>
        <p class="text-sm text-muted">{{ cart.requiresShipping ? 'Shipping is worked out at checkout.' : 'Nothing to ship.' }}</p>
        <UButton to="/checkout" label="Checkout" size="xl" block :disabled="blocked" />
        <UButton to="/cart" label="View cart" color="neutral" variant="outline" size="lg" block />
      </div>
    </template>
  </USlideover>
</template>
