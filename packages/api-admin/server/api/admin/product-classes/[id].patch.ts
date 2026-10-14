import { ProductClassService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateProductClassSchema.parse)
  return await new ProductClassService(useDb()).update(id, body)
})
