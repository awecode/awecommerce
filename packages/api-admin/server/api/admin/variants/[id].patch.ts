import { ProductVariantService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateVariantSchema.parse)
  return await new ProductVariantService(useDb()).update(id, body)
})
