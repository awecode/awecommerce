import { ProductService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const query = getQuery(event)
  return await new ProductService(useDb()).list({
    isActive: true,
    pagination: {
      page: Number(query.page) || 1,
      size: Number(query.size) || 20,
    },
  })
})
