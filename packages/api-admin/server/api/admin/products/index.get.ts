import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Every product, drafts and inactive ones included, one page at a time. A
// category also matches the products in the categories under it.
export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, productListQuery.parse)
  return await new ProductService(useDb()).list({
    q: query.q,
    status: query.status,
    isActive: query.active,
    categories: query.categories,
    includeSubcategories: true,
    brands: query.brands,
    productClass: query.productClass,
    isFeatured: query.featured,
    isBestSeller: query.bestSeller,
    sortBy: query.sortBy,
    includeInactiveBrands: true,
    includeInactiveCategories: true,
    includeInactiveProductClasses: true,
    pagination: { page: query.page, size: query.size },
  })
})
