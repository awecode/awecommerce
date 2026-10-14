import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Active, published products, one page at a time. Products under an inactive
// category, at any depth, are left out.
export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, productListQuery.parse)
  return await new ProductService(useDb()).list({
    isActive: true,
    status: 'Published',
    q: query.q,
    categories: query.categories,
    // A category shows the products of its subcategories too
    includeSubcategories: true,
    brands: query.brands,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sortBy: query.sortBy,
    isFeatured: query.featured,
    isBestSeller: query.bestSeller,
    pagination: { page: query.page, size: query.size },
  })
})
