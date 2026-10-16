<script setup lang="ts">
// The home page: the hero, shop by category, the membership plans on sale
// (for a member, the ones they can join), then featured products and best
// sellers (the product flags set in the backoffice)
const { store } = useAppConfig()
useSeoMeta({ description: store.description })

const menu = useCategoryMenu()
const { user } = useAuth()
const [{ data: featured }, { data: bestSellers }, { data: plans }] = await Promise.all([
  useFetch('/api/store/products', { key: 'home-featured', query: { featured: true, size: 4 } }),
  useFetch('/api/store/products', { key: 'home-best-sellers', query: { bestSeller: true, size: 4 } }),
  useFetch('/api/store/membership-plans', { key: 'home-membership-plans', watch: [() => user.value?.id] }),
])
</script>

<template>
  <HomeHero />

  <section v-if="menu.length" aria-labelledby="shop-by-category" class="py-12">
    <UContainer>
      <h2 id="shop-by-category" class="mb-8 text-3xl font-medium tracking-tight">Shop by category</h2>
      <ul class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <li v-for="category in menu" :key="category.id">
          <NuxtLink :to="`/categories/${category.slug}`" class="group relative flex aspect-square items-end overflow-hidden rounded-sm bg-elevated p-5">
            <img v-if="category.logo" :src="category.logo" alt="" loading="lazy" class="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]">
            <span class="relative font-serif text-xl text-highlighted" :class="{ 'rounded-sm bg-default/90 px-3 py-1': category.logo }">{{ category.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UContainer>
  </section>

  <section v-if="plans?.length" aria-labelledby="memberships" class="py-12">
    <UContainer>
      <h2 id="memberships" class="mb-8 text-3xl font-medium tracking-tight">Memberships</h2>
      <MembershipPlans :options="plans" :sign-in-to="user ? undefined : '/login?redirect=/'" />
    </UContainer>
  </section>

  <ProductShelf title="Featured" :products="featured?.results ?? []" />
  <ProductShelf title="Best sellers" :products="bestSellers?.results ?? []" />
</template>
