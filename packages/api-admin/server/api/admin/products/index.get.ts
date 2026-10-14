import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Lists every product, active or not
export default defineServiceHandler(async (event) => {
  const query = getQuery(event)
  const result = await new ProductService(useDb()).list({
    pagination: {
      page: Number(query.page) || 1,
      size: Number(query.size) || 20,
    },
  })
  // list() returns the paginated shape whenever pagination is passed
  return result as Extract<typeof result, { pagination: unknown }>
})
