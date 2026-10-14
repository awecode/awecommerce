import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Products the store shows (the library's listed rule), one page at a time
export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, productListQuery.parse)
  return await new ProductService(useDb()).list({
    listedOnly: true,
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
