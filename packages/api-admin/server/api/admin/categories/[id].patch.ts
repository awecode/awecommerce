import { CategoryService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateCategorySchema.parse)
  return await new CategoryService(useDb()).update(id, body)
})
