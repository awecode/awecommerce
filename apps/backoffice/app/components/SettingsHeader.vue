<script setup lang="ts">
// The header of a settings form: its title, and Save (⌘S) with Discard once
// there are changes
defineProps<{ title: string; dirty: boolean; saving: boolean }>()
defineEmits<{ save: []; discard: [] }>()
</script>

<template>
  <UDashboardNavbar :title="title" icon="i-lucide-settings">
    <template #leading>
      <UDashboardSidebarCollapse />
    </template>
    <template #right>
      <span v-if="dirty" class="text-xs text-muted">Unsaved changes</span>
      <UButton v-if="dirty" color="neutral" variant="ghost" label="Discard" @click="$emit('discard')" />
      <UButton :loading="saving" :disabled="!dirty" label="Save" @click="$emit('save')">
        <template #trailing>
          <UKbd value="meta" size="sm" /><UKbd value="s" size="sm" />
        </template>
      </UButton>
    </template>
  </UDashboardNavbar>
</template>
