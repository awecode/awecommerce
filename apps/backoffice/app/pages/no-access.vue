<script setup lang="ts">
// A signed-in user without the admin role
definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'No access' })

const { user, signOut } = useAuth()
</script>

<template>
  <UPageCard variant="subtle">
    <div class="space-y-1">
      <h1 class="text-base font-semibold text-highlighted">No access</h1>
      <p class="text-sm text-muted">
        {{ user?.email }} is not a staff account. Ask an admin to give it access, or sign in with another email.
      </p>
    </div>
    <UButton block color="neutral" variant="outline" label="Sign out" @click="signOut({ redirectTo: '/login' })" />
  </UPageCard>
</template>
