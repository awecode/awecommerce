import { inArray } from 'drizzle-orm'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { OwnershipService } from '@awecommerce/service/apps/order/services/ownership'
import { OfferService } from '@awecommerce/service/apps/offer/services/offer'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { products } from '@awecommerce/service/apps/product/schemas'

// A listed product with its active variants and listed related products (as
// product list rows, with their prices and stock, for product cards). Each
// variant says whether it is in stock: its stock is not counted (the product
// class does not track stock), or some is left, and its `memberPrice` when
// members of a plan pay less for one: the buyer's own (`isYours`) when they
// hold such a plan, otherwise the lowest, or null. A variant that sells a
// membership has `membership`: the plan's id, name and description (rich
// text) and the months; null otherwise. `oncePerPerson`: it is bought one at
// a time (a membership, or a once per person product), and `ownedInOrder` the
// paid order the signed-in buyer owns it from, or null.
const membershipOf = (term?: { planId: number; months: number; plan: { name: string; description: string | null } }) =>
  term ? { planId: term.planId, planName: term.plan.name, description: term.plan.description, months: term.months } : null

export default defineServiceHandler(async (event) => {
  const db = useDb()
  const productService = new ProductService(db)
  const [product, user] = await Promise.all([productService.getListedBySlug(getRouterParam(event, 'slug')!), getUser(event)])
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Product not found' })
  }
  const relatedIds = product.relatedProducts.map((related) => related.id)
  const variants = product.variants.filter((variant) => variant.isActive)
  const variantIds = variants.map((variant) => variant.id)
  const memberships = new MembershipService(db)
  const ownership = new OwnershipService(db)
  // Each of these needs only the product, so they run at once. Member prices
  // load the buyer's plans themselves; ownership does not wait for singles.
  const [relatedProducts, { yours, lowest }, terms, singles, owned] = await Promise.all([
    relatedIds.length ? productService.list({ listedOnly: true, extraFilters: [inArray(products.id, relatedIds)] }) : [],
    new OfferService(db).memberPricesFor(variants, user ? memberships.activePlanIds(user.id) : []),
    memberships.termsForVariants(variantIds),
    ownership.singleVariants(variantIds),
    ownership.ownedVariants(user?.id, variantIds),
  ])
  return {
    ...product,
    variants: variants.map((variant) => {
      const own = yours.get(variant.id)
      const memberPrice = own ? { ...own, isYours: true } : lowest.has(variant.id) ? { ...lowest.get(variant.id)!, isYours: false } : null
      return {
        ...storeVariant(variant),
        inStock: product.productClass?.trackStock === false || (variant.stockQuantity ?? 0) > 0,
        memberPrice,
        membership: membershipOf(terms.get(variant.id)),
        oncePerPerson: singles.has(variant.id),
        ownedInOrder: owned.get(variant.id) ?? null,
      }
    }),
    relatedProducts,
  }
})
