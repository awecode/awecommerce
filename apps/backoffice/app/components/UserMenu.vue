<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const { user, signOut } = useAuth()
const colorMode = useColorMode()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.email ?? '' }],
  [
    {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: (['system', 'light', 'dark'] as const).map((mode) => ({
        label: mode[0]!.toUpperCase() + mode.slice(1),
        icon: { system: 'i-lucide-monitor', light: 'i-lucide-sun', dark: 'i-lucide-moon' }[mode],
        type: 'checkbox',
        checked: colorMode.preference === mode,
        onSelect: (event: Event) => {
          event.preventDefault()
          colorMode.preference = mode
        },
      })),
    },
  ],
  [
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      onSelect: () => signOut({ redirectTo: '/login' }),
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'center', collisionPadding: 12 }" :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }">
    <UButton
      :avatar="{ alt: user?.name || user?.email || '' }"
      :label="collapsed ? undefined : (user?.name || user?.email)"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
