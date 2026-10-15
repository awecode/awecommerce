<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { data: store } = useStoreSettings()

const close = () => (open.value = false)
const links: NavigationMenuItem[][] = [
  [
    { label: 'Orders', icon: 'i-lucide-receipt', to: '/orders', onSelect: close },
    { label: 'Products', icon: 'i-lucide-package', to: '/products', onSelect: close },
    { label: 'Offers', icon: 'i-lucide-badge-percent', to: '/offers', onSelect: close },
    { label: 'Customers', icon: 'i-lucide-users', to: '/customers', onSelect: close },
  ],
  [
    { label: 'Catalog', type: 'label' },
    { label: 'Categories', icon: 'i-lucide-folder-tree', to: '/catalog/categories', onSelect: close },
    { label: 'Brands', icon: 'i-lucide-tag', to: '/catalog/brands', onSelect: close },
    { label: 'Product classes', icon: 'i-lucide-shapes', to: '/catalog/product-classes', onSelect: close },
  ],
  [
    { label: 'Memberships', type: 'label' },
    { label: 'Members', icon: 'i-lucide-crown', to: '/memberships', exact: true, onSelect: close },
    { label: 'Plans', icon: 'i-lucide-layers', to: '/memberships/plans', onSelect: close },
  ],
  [
    { label: 'Settings', type: 'label' },
    { label: 'Store', icon: 'i-lucide-store', to: '/settings/store', onSelect: close },
    { label: 'Tax', icon: 'i-lucide-percent', to: '/settings/tax', onSelect: close },
    { label: 'Shipping', icon: 'i-lucide-truck', to: '/settings/shipping', onSelect: close },
    { label: 'Loyalty', icon: 'i-lucide-gift', to: '/settings/loyalty', onSelect: close },
  ],
]

// The ⌘K palette: go to any screen, or start a new record
const groups = computed(() => [
  {
    id: 'go-to',
    label: 'Go to',
    items: links.flat().filter((link) => link.to).map(({ label, icon, to }) => ({ label, icon, to })),
  },
  {
    id: 'create',
    label: 'Create',
    items: [
      { label: 'New product', icon: 'i-lucide-plus', to: '/products/new' },
      { label: 'New offer', icon: 'i-lucide-plus', to: '/offers/new' },
      { label: 'New category', icon: 'i-lucide-plus', to: '/catalog/categories?new=1' },
      { label: 'New brand', icon: 'i-lucide-plus', to: '/catalog/brands?new=1' },
      { label: 'New product class', icon: 'i-lucide-plus', to: '/catalog/product-classes?new=1' },
      { label: 'New membership plan', icon: 'i-lucide-plus', to: '/memberships/plans?new=1' },
      { label: 'Grant membership', icon: 'i-lucide-plus', to: '/memberships?grant=1' },
      { label: 'Add staff', icon: 'i-lucide-plus', to: '/customers?add=1' },
    ],
  },
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-1 min-w-0">
          <div class="size-6 shrink-0 rounded-md bg-primary text-inverted grid place-items-center text-xs font-semibold">
            {{ (store?.name || 'Store').slice(0, 1).toUpperCase() }}
          </div>
          <span v-if="!collapsed" class="truncate text-sm font-semibold">{{ store?.name || 'Store' }}</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />
        <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip popover />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" :color-mode="false" />

    <slot />
  </UDashboardGroup>
</template>
