import { ProductOptionService } from '@awecommerce/service/apps/product/services/product'

// Renames an option value, such as M
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { value } = await readValidatedBody(event, renameOptionValueSchema.parse)
  return await new ProductOptionService(useDb()).renameValue(id, value)
})
