<script setup lang="ts">
// Paying an unpaid order with an online method, on its page. Right after the
// gateway sends the buyer back, while we have not heard how it went, it says
// "Confirming your payment" and checks a few times. Otherwise (or after a
// failed try, which it says) Pay now, with any method the order can use: an
// online one goes to its gateway, an offline one (such as cash on delivery)
// switches the order to it.
type Payment = {
  canPay: boolean
  latestTry: { status: 'open' | 'failed'; message: string | null } | null
  methods: { id: string; label: string; description: string | null; online: boolean }[]
}
const props = defineProps<{ orderId: number; hash?: string; payment: Payment }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

// ---- confirming: a few checks, a few seconds apart
const confirming = ref(props.payment.latestTry?.status === 'open')
onMounted(async () => {
  for (let attempt = 0; confirming.value && attempt < 5; attempt++) {
    try {
      const payment = await $fetch<Payment>(`/api/store/orders/${props.orderId}/payment-check`, { method: 'POST', body: { hash: props.hash } })
      if (!payment.canPay || payment.latestTry?.status !== 'open') {
        confirming.value = false
        emit('changed')
        return
      }
    } catch {
      // Checked again below, or the buyer pays again
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  confirming.value = false
})

// ---- paying
const method = ref(props.payment.methods.find((m) => m.online)?.id ?? props.payment.methods[0]?.id)
const items = computed(() => props.payment.methods.map((m) => ({ label: m.label, description: m.description ?? undefined, value: m.id })))
const paying = ref(false)
const pay = async () => {
  if (!method.value) return
  paying.value = true
  try {
    const { redirectUrl } = await $fetch<{ redirectUrl: string | null }>(`/api/store/orders/${props.orderId}/pay`, {
      method: 'POST',
      body: { paymentMethod: method.value, hash: props.hash },
    })
    if (redirectUrl) {
      await navigateTo(redirectUrl, { external: true })
      return
    }
    emit('changed')
  } catch (error) {
    toast.add({ title: (error as { data?: { message?: string } }).data?.message ?? 'The payment could not be started', color: 'error', icon: 'i-lucide-circle-alert' })
  }
  paying.value = false
}
</script>

<template>
  <section aria-labelledby="pay-now" class="space-y-4 rounded-sm bg-muted p-6">
    <h2 id="pay-now" class="text-2xl font-medium">{{ confirming ? 'Confirming your payment…' : 'Payment' }}</h2>
    <p v-if="confirming" class="flex items-center gap-2 text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> This takes a few seconds.
    </p>
    <template v-else>
      <p v-if="payment.latestTry?.status === 'failed'" class="text-error">
        Your last payment did not go through<template v-if="payment.latestTry.message">: {{ payment.latestTry.message }}</template>.
      </p>
      <p v-else-if="payment.latestTry?.status === 'open'" class="text-muted">We have not heard back about your payment yet. If you did not pay, pay now.</p>
      <p v-else class="text-muted">This order is not paid yet.</p>
      <URadioGroup v-if="items.length > 1" v-model="method" :items="items" variant="table" aria-label="Pay with" />
      <UButton label="Pay now" size="lg" :loading="paying" :disabled="!method" @click="pay" />
    </template>
  </section>
</template>
