<script setup lang="ts">
definePageMeta({ auth: false })
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
  <AuthCard>
    <div class="space-y-2">
      <h1 class="text-3xl font-medium">Sign-in failed</h1>
      <p class="text-muted text-pretty">{{ message }}</p>
    </div>
    <UButton to="/login" block size="xl" label="Back to sign in" />
  </AuthCard>
</template>
