<script setup lang="ts">
import { z } from 'zod'
import { safeInternalPath } from '#layers/auth/shared/safeInternalPath'

definePageMeta({ layout: 'auth', auth: { only: 'guest' } })
useSeoMeta({ title: 'Sign in' })

const { client, fetchSession } = useAuth()
const route = useRoute()
const { public: { auth } } = useRuntimeConfig()

const redirectTo = computed(() => {
  const value = route.query.redirect
  return (typeof value === 'string' && safeInternalPath(value, '')) || auth.redirectUserTo
})

// Step one: the email to send the link to
const emailState = reactive({ email: '' })
const emailSchema = z.object({ email: z.email('Enter a valid email address') })
const sentTo = ref('')
const sending = ref(false)

// Step two: the token from the email, for when the link is not clicked
const tokenState = reactive({ token: '' })
const tokenSchema = z.object({ token: z.string().trim().min(1, 'Enter the token from the email') })
const verifying = ref(false)

const errorMessage = ref('')

const sendLink = async () => {
  sending.value = true
  errorMessage.value = ''
  const { error } = await client.signIn.magicLink({
    email: emailState.email,
    callbackURL: redirectTo.value,
    newUserCallbackURL: redirectTo.value,
    errorCallbackURL: auth.redirectErrorTo,
  })
  sending.value = false
  if (error) {
    errorMessage.value = error.message || 'Could not send the email. Try again.'
    return
  }
  sentTo.value = emailState.email
}

const verifyToken = async () => {
  verifying.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/auth/magic-link-verify', { method: 'POST', body: { token: tokenState.token.trim() } })
    await fetchSession()
    await navigateTo(redirectTo.value)
  } catch {
    errorMessage.value = 'That token is invalid or has expired. Request a new email.'
  } finally {
    verifying.value = false
  }
}

const startOver = () => {
  sentTo.value = ''
  tokenState.token = ''
  errorMessage.value = ''
}
</script>

<template>
  <UPageCard variant="subtle">
    <div class="space-y-1">
      <h1 class="text-base font-semibold text-highlighted">
        {{ sentTo ? 'Check your email' : 'Sign in to the backoffice' }}
      </h1>
      <p class="text-sm text-muted">
        <template v-if="sentTo">
          We sent a sign-in link to <span class="font-medium text-default">{{ sentTo }}</span>. Open it, or paste the token from the email.
        </template>
        <template v-else>
          We will email you a link to sign in. No password needed.
        </template>
      </p>
    </div>

    <UForm v-if="!sentTo" :schema="emailSchema" :state="emailState" class="space-y-3" @submit="sendLink">
      <UFormField name="email" label="Email">
        <UInput v-model="emailState.email" type="email" autocomplete="email" placeholder="you@example.com" autofocus class="w-full" />
      </UFormField>
      <UButton type="submit" block :loading="sending" label="Email me a sign-in link" />
    </UForm>

    <UForm v-else :schema="tokenSchema" :state="tokenState" class="space-y-3" @submit="verifyToken">
      <UFormField name="token" label="Token">
        <UInput v-model="tokenState.token" autocomplete="one-time-code" placeholder="Paste the token" autofocus class="w-full font-mono" />
      </UFormField>
      <UButton type="submit" block :loading="verifying" label="Sign in" />
      <UButton variant="link" color="neutral" class="px-0" label="Use a different email" @click="startOver" />
    </UForm>

    <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
  </UPageCard>
</template>
