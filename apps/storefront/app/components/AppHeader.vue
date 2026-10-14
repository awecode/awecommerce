<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

// The shop's header: name or logo, the category menu (in a drawer on small
// screens), search, the account menu and the cart
const { store } = useAppConfig()
const { data: settings } = useStoreSettings()
const menu = useCategoryMenu()
const { count } = useCart()
const { user, signOut } = useAuth()

const storeName = computed(() => settings.value?.name || 'Store')

// Top-level categories; the ones with subcategories open a panel listing them
const links = computed<NavigationMenuItem[]>(() =>
  menu.value.map((category) => ({
    label: category.name,
    to: `/categories/${category.slug}`,
    ...(category.children.length
      ? {
          children: [
            { label: `All ${category.name}`, to: `/categories/${category.slug}` },
            ...category.children.map((child) => ({ label: child.name, to: `/categories/${child.slug}` })),
          ],
        }
      : {}),
  })),
)

// ---- search
const searchOpen = ref(false)
const q = ref('')
const search = async () => {
  if (!q.value.trim()) return
  searchOpen.value = false
  await navigateTo({ path: '/search', query: { q: q.value.trim() } })
  q.value = ''
}

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.email ?? '' }],
  [
    { label: 'Orders', icon: 'i-lucide-package', to: '/account/orders' },
    { label: 'Addresses', icon: 'i-lucide-map-pin', to: '/account/addresses' },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => signOut({ redirectTo: '/' }) }],
])
</script>

<template>
  <UHeader :ui="{ root: 'bg-default/90 border-b border-default', title: 'font-serif text-xl font-semibold tracking-tight' }">
    <template #title>
      <img v-if="store.logo" :src="store.logo" :alt="storeName" class="h-8 w-auto">
      <span v-else>{{ storeName }}</span>
    </template>

    <UNavigationMenu :items="links" variant="link" :ui="{ link: 'text-sm' }" aria-label="Categories" />

    <template #right>
      <UButton icon="i-lucide-search" color="neutral" variant="ghost" aria-label="Search" @click="searchOpen = true" />
      <UDropdownMenu v-if="user" :items="accountItems" :content="{ align: 'end' }">
        <UButton icon="i-lucide-user" color="neutral" variant="ghost" aria-label="Account" />
      </UDropdownMenu>
      <UButton v-else icon="i-lucide-user" color="neutral" variant="ghost" to="/login" aria-label="Sign in" />
      <UChip :text="count" :show="count > 0" size="3xl" color="primary" inset>
        <UButton icon="i-lucide-shopping-bag" color="neutral" variant="ghost" to="/cart" :aria-label="count ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart'" />
      </UChip>
    </template>

    <template #body>
      <UNavigationMenu :items="links" orientation="vertical" aria-label="Categories" class="-mx-2.5" />
    </template>
  </UHeader>

  <UModal v-model:open="searchOpen" title="Search" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <form role="search" @submit.prevent="search">
        <UInput v-model="q" icon="i-lucide-search" placeholder="Search products" size="xl" autofocus class="w-full" aria-label="Search products" />
      </form>
    </template>
  </UModal>
</template>
