<script setup lang="ts">
// The home page, in order: the hero, featured offers, featured products,
// the membership plans on sale (for a member, the ones they can join), shop
// by category, best sellers, new arrivals, a row for each featured category
// (featured products first, then newest), then shop by brand. Loaded in one
// request. Flags and order are set in the backoffice; empty sections are
// left out.
const { store } = useAppConfig()
useSeoMeta({ description: store.description })

const menu = useCategoryMenu()
const { user } = useAuth()
const { data: home } = await useFetch('/api/store/home', {
  key: 'home',
  watch: [() => user.value?.id],
})

// Shop by category: images only when some category has a logo; then the
// others get the default image
const categoryImages = computed(() => menu.value.some((category) => category.logo))
</script>

<template>
  <HomeHero />

  <HomeOffers :offers="home?.offers ?? []" />

  <ProductShelf title="Featured" :products="home?.featured ?? []" />

  <section v-if="home?.membershipPlans.length" aria-labelledby="memberships" class="py-12">
    <UContainer>
      <h2 id="memberships" class="mb-8 text-3xl font-medium tracking-tight">Memberships</h2>
      <MembershipPlans :options="home.membershipPlans" :sign-in-to="user ? undefined : '/login?redirect=/'" />
    </UContainer>
  </section>

  <section v-if="menu.length" aria-labelledby="shop-by-category" class="py-12">
    <UContainer>
      <h2 id="shop-by-category" class="mb-8 text-3xl font-medium tracking-tight">Shop by category</h2>
      <ul class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <li v-for="category in menu" :key="category.id">
          <NuxtLink
            :to="`/categories/${category.slug}`"
            class="group relative flex items-end overflow-hidden rounded-sm bg-elevated p-5"
            :class="categoryImages ? 'aspect-square' : 'min-h-24 transition hover:bg-accented'"
          >
            <AppImage
              v-if="categoryImages"
              :src="category.logo || '/images/category.svg'"
              alt=""
              :width="600"
              :height="600"
              class="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            <span class="relative font-serif text-xl text-highlighted" :class="{ 'rounded-sm bg-default/90 px-3 py-1': categoryImages }">{{ category.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UContainer>
  </section>

  <ProductShelf title="Best sellers" :products="home?.bestSellers ?? []" />
  <ProductShelf title="New arrivals" :products="home?.newArrivals ?? []" />

  <ProductShelf
    v-for="row in home?.categories ?? []"
    :key="row.category.id"
    :title="row.category.name"
    :products="row.products"
    :more="`/categories/${row.category.slug}`"
  />

  <section v-if="home?.brands.length" aria-labelledby="shop-by-brand" class="py-12">
    <UContainer>
      <h2 id="shop-by-brand" class="mb-8 text-3xl font-medium tracking-tight">Shop by brand</h2>
      <ul class="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <li v-for="brand in home.brands" :key="brand.id">
          <NuxtLink :to="`/brands/${brand.slug}`" class="flex aspect-3/2 items-center justify-center rounded-sm bg-elevated p-4 transition hover:bg-accented active:scale-[0.98]" :aria-label="brand.name">
            <AppImage v-if="brand.logo" :src="brand.logo" alt="" :width="240" fit="contain" format="" class="max-h-full max-w-full object-contain" />
            <span v-else class="text-center font-serif text-lg text-highlighted">{{ brand.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UContainer>
  </section>
</template>
