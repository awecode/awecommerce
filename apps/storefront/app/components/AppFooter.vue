<script setup lang="ts">
// The shop's footer: name and tagline, the top-level categories, and the
// links set in app.config.ts
const { store } = useAppConfig()
const { data: settings } = useStoreSettings()
const menu = useCategoryMenu()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-24 border-t border-default bg-muted">
    <UContainer class="grid gap-10 py-14 sm:grid-cols-3">
      <div class="space-y-2">
        <p class="font-serif text-xl font-semibold">{{ settings?.name || 'Store' }}</p>
        <p class="max-w-xs text-sm text-muted">{{ store.tagline }}</p>
      </div>
      <nav v-if="menu.length" aria-label="Shop">
        <p class="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Shop</p>
        <ul class="space-y-2 text-sm">
          <li v-for="category in menu" :key="category.id">
            <NuxtLink :to="`/categories/${category.slug}`" class="hover:underline">{{ category.name }}</NuxtLink>
          </li>
        </ul>
      </nav>
      <nav v-if="store.footer.links.length" aria-label="Help">
        <p class="mb-3 text-xs font-medium tracking-wider text-muted uppercase">Help</p>
        <ul class="space-y-2 text-sm">
          <li v-for="link in store.footer.links" :key="link.to">
            <NuxtLink :to="link.to" class="hover:underline">{{ link.label }}</NuxtLink>
          </li>
        </ul>
      </nav>
    </UContainer>
    <UContainer>
      <p class="border-t border-default py-6 text-xs text-muted">© {{ year }} {{ settings?.name || 'Store' }}</p>
    </UContainer>
  </footer>
</template>
