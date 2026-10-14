import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Lists every product, active or not
export default defineServiceHandler(async (event) => {
  const query = getQuery(event)
  return await new ProductService(useDb()).list({
    pagination: {
      page: Number(query.page) || 1,
      size: Number(query.size) || 20,
    },
  })
})
