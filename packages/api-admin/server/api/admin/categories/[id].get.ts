import { CategoryService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new CategoryService(useDb()).get(id), `Category not found: ${id}`)
})
