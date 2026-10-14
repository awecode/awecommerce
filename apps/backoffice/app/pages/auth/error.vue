<script setup lang="ts">
definePageMeta({ layout: 'auth', auth: false })
useSeoMeta({ title: 'Sign-in failed', robots: 'noindex, nofollow' })

const route = useRoute()
const messages: Record<string, string> = {
  INVALID_TOKEN: 'This link is invalid or was already used. Email scanners sometimes open links first. Request a new one, or paste the token from the email.',
  EXPIRED_TOKEN: 'This link has expired. Request a new one.',
}
const message = computed(() =>
  messages[String(route.query.error ?? '')] ?? 'Something went wrong while signing in. Request a new link and try again.',
)
</script>

<template>
  <UPageCard variant="subtle">
    <div class="space-y-1">
      <h1 class="text-base font-semibold text-highlighted">Sign-in failed</h1>
      <p class="text-sm text-muted">{{ message }}</p>
    </div>
    <UButton to="/login" block label="Back to sign in" />
  </UPageCard>
</template>
