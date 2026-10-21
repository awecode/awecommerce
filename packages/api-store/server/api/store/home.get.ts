import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { OfferService } from '@awecommerce/service/apps/offer/services/offer'
import { BrandService, CategoryService, ProductService } from '@awecommerce/service/apps/product/services/product'

// Everything the home page shows, in one request: featured offers, featured
// products, the plans a visitor can join (as /api/store/membership-plans),
// best sellers, new arrivals, a row of products for each featured category
// (featured products first, then newest), and brands. Categories, settings
// and the cart stay on their own routes.
export default defineServiceHandler(async (event) => {
  const db = useDb()
  const products = new ProductService(db)
  const userPromise = getUser(event)
  const featuredCategoriesPromise = new CategoryService(db).list({
    isActive: true,
    excludeInactiveBranches: true,
    hasListedProducts: true,
    isFeatured: true,
  })
  // Only the plans need the session. Shelves start as soon as the featured
  // categories are known, while the rest still load.
  const [offers, featured, plans, bestSellers, newArrivals, brands, featuredCategories, shelves] = await Promise.all([
    new OfferService(db).featuredForEveryone(),
    products.list({ listedOnly: true, isFeatured: true, limit: 4 }),
    userPromise.then((user) => new MembershipService(db).plansToJoin(user?.id)),
    products.list({ listedOnly: true, isBestSeller: true, limit: 4 }),
    products.list({ listedOnly: true, limit: 4 }),
    new BrandService(db).list({ isActive: true, hasListedProducts: true }),
    featuredCategoriesPromise,
    featuredCategoriesPromise.then((categories) =>
      products.productsForCategories(categories.map((category) => category.id), 4),
    ),
  ])
  const categories = featuredCategories.map((category) => ({
    category: { id: category.id, name: category.name, slug: category.slug },
    products: shelves.get(category.id) ?? [],
  }))

  return {
    offers: offers.map(({ id, name, description, image, type, voucherCode, endDate, benefit, condition }) => ({
      id,
      name,
      description,
      image,
      type,
      voucherCode,
      endDate,
      benefit,
      condition,
    })),
    featured,
    membershipPlans: plans.map(({ plan, replaces, terms }) => ({
      plan: { id: plan.id, name: plan.name, program: plan.program, description: plan.description },
      replaces,
      terms: terms.map(({ id, variantId, months, price }) => ({ id, variantId, months, price })),
    })),
    bestSellers,
    newArrivals,
    brands,
    categories,
  }
})
