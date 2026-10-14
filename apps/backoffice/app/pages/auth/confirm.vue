<script setup lang="ts">
import { parseMagicLinkConfirmHash } from '#layers/auth/shared/magicLinkConfirmHash'
import { safeInternalPath } from '#layers/auth/shared/safeInternalPath'

// The page the emailed link opens. Signing in takes a click, so email
// scanners that open links do not use up the one-time token.
definePageMeta({ layout: 'auth', auth: false })
useSeoMeta({ title: 'Confirm sign-in', robots: 'noindex, nofollow' })

const { fetchSession } = useAuth()
const { public: { auth } } = useRuntimeConfig()

const token = ref('')
const callbackURL = ref<string | null>(null)
const errorMessage = ref('')
const verifying = ref(false)

onMounted(() => {
  const parsed = parseMagicLinkConfirmHash(window.location.hash)
  token.value = parsed.token
  callbackURL.value = parsed.callbackURL
  // The token should not stay in the address bar or history
  if (window.location.hash) {
    const clean = new URL(window.location.href)
    clean.hash = ''
    history.replaceState(history.state, '', `${clean.pathname}${clean.search}`)
  }
  if (!token.value) {
    errorMessage.value = 'This sign-in link has no token. Request a new one.'
  }
})

const confirm = async () => {
  verifying.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/magic-link-verify', { method: 'POST', body: { token: token.value } })
    await fetchSession()
    await navigateTo(safeInternalPath(callbackURL.value, auth.redirectUserTo))
  } catch {
    errorMessage.value = 'This link is invalid or has expired. Request a new one.'
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <UPageCard variant="subtle">
    <div class="space-y-1">
      <h1 class="text-base font-semibold text-highlighted">Confirm sign-in</h1>
      <p class="text-sm text-muted">Continue to finish signing in to the backoffice.</p>
    </div>
    <UButton block :disabled="!token" :loading="verifying" label="Continue" @click="confirm" />
    <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
    <UButton to="/login" variant="link" color="neutral" class="px-0" label="Request a new link" />
  </UPageCard>
</template>
