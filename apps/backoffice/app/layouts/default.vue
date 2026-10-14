<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { data: store } = useStoreSettings()

const links: NavigationMenuItem[] = [
  { label: 'Products', icon: 'i-lucide-package', to: '/products', onSelect: () => (open.value = false) },
]

// The ⌘K palette: go to any screen
const groups = computed(() => [
  { id: 'go-to', label: 'Go to', items: links.map(({ label, icon, to }) => ({ label, icon, to })) },
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
