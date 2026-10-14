import { ProductOptionService } from '@awecommerce/service/apps/product/services/product'

// Renames an option, such as Size
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { name } = await readValidatedBody(event, renameOptionSchema.parse)
  return await new ProductOptionService(useDb()).rename(id, name)
})
