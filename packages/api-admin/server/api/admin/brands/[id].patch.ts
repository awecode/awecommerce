import { BrandService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateBrandSchema.parse)
  return await new BrandService(useDb()).update(id, body)
})
