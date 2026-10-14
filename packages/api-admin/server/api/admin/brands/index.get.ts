import { BrandService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, listQuery.parse)
  return await new BrandService(useDb()).list({
    q: query.q,
    isActive: query.active,
    pagination: { page: query.page, size: query.size },
  })
})
