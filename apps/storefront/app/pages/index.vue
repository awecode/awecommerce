<script setup lang="ts">
import type { CardProduct } from '~/components/ProductCard.vue'

// The home page, in order: the hero, featured offers, featured products,
// the membership plans on sale (for a member, the ones they can join), shop
// by category, best sellers, new arrivals, a row of the newest products for
// each featured category, then shop by brand. Flags and order are set in the
// backoffice; empty sections are left out.
const { store } = useAppConfig()
useSeoMeta({ description: store.description })

const menu = useCategoryMenu()
const { user } = useAuth()
const requestFetch = useRequestFetch()
const [{ data: categories }, { data: brands }, { data: offers }, { data: featured }, { data: plans }, { data: newest }, { data: bestSellers }] =
  await Promise.all([
    useCategories(),
    useBrands(),
    useFetch('/api/store/offers', { key: 'home-offers' }),
    useFetch('/api/store/products', { key: 'home-featured', query: { featured: true, size: 4 } }),
    useFetch('/api/store/membership-plans', { key: 'home-membership-plans', watch: [() => user.value?.id] }),
    useFetch('/api/store/products', { key: 'home-new-arrivals', query: { size: 4 } }),
    useFetch('/api/store/products', { key: 'home-best-sellers', query: { bestSeller: true, size: 4 } }),
  ])

// Shop by category: images only when some category has a logo; then the
// others get the default image
const categoryImages = computed(() => menu.value.some((category) => category.logo))

// Each featured category with its 4 newest products (and its subcategories')
const featuredCategories = computed(() => (categories.value ?? []).filter((category) => category.isFeatured))
const { data: categoryRows } = await useAsyncData(
  'home-category-rows',
  () =>
    Promise.all(
      featuredCategories.value.map(async (category) => ({
        category,
        products: ((await requestFetch('/api/store/products', { query: { categories: category.id, size: 4 } })) as { results: CardProduct[] }).results,
      })),
    ),
  { watch: [featuredCategories] },
)
</script>

<template>
  <HomeHero />

  <HomeOffers :offers="offers ?? []" />

  <ProductShelf title="Featured" :products="featured?.results ?? []" />

  <section v-if="plans?.length" aria-labelledby="memberships" class="py-12">
    <UContainer>
      <h2 id="memberships" class="mb-8 text-3xl font-medium tracking-tight">Memberships</h2>
      <MembershipPlans :options="plans" :sign-in-to="user ? undefined : '/login?redirect=/'" />
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
            <img
              v-if="categoryImages"
              :src="category.logo || '/images/category.svg'"
              alt=""
              loading="lazy"
              class="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]"
            >
            <span class="relative font-serif text-xl text-highlighted" :class="{ 'rounded-sm bg-default/90 px-3 py-1': categoryImages }">{{ category.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UContainer>
  </section>

  <ProductShelf title="Best sellers" :products="bestSellers?.results ?? []" />
  <ProductShelf title="New arrivals" :products="newest?.results ?? []" />

  <ProductShelf
    v-for="row in categoryRows ?? []"
    :key="row.category.id"
    :title="row.category.name"
    :products="row.products"
    :more="`/categories/${row.category.slug}`"
  />

  <section v-if="brands?.length" aria-labelledby="shop-by-brand" class="py-12">
    <UContainer>
      <h2 id="shop-by-brand" class="mb-8 text-3xl font-medium tracking-tight">Shop by brand</h2>
      <ul class="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <li v-for="brand in brands" :key="brand.id">
          <NuxtLink :to="`/brands/${brand.slug}`" class="flex aspect-3/2 items-center justify-center rounded-sm bg-elevated p-4 transition hover:bg-accented" :aria-label="brand.name">
            <img v-if="brand.logo" :src="brand.logo" alt="" loading="lazy" class="max-h-full max-w-full object-contain">
            <span v-else class="text-center font-serif text-lg text-highlighted">{{ brand.name }}</span>
          </NuxtLink>
        </li>
      </ul>
    </UContainer>
  </section>
</template>
