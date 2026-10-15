<script setup lang="ts">
// The account pages' frame: the title, the sections and Sign out
defineProps<{ title: string }>()
const { user, signOut } = useAuth()
const links = [
  { label: 'Overview', to: '/account', exact: true },
  { label: 'Orders', to: '/account/orders' },
  { label: 'Addresses', to: '/account/addresses' },
]
</script>

<template>
  <UContainer class="py-10 lg:py-14">
    <p class="text-sm text-muted">{{ user?.email }}</p>
    <h1 class="mt-1 text-4xl font-medium tracking-tight sm:text-5xl">{{ title }}</h1>
    <div class="mt-8 flex items-center gap-4 border-b border-default">
      <UNavigationMenu :items="links" variant="link" highlight aria-label="Account" class="-mb-px flex-1" />
      <UButton label="Sign out" color="neutral" variant="link" icon="i-lucide-log-out" @click="signOut({ redirectTo: '/' })" />
    </div>
    <div class="mt-10">
      <slot />
    </div>
  </UContainer>
</template>
