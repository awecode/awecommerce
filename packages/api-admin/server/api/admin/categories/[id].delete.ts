import { CategoryService } from '@awecommerce/service/apps/product/services/product'

// A category with products or subcategories cannot be deleted (409); deactivate it instead
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new CategoryService(useDb()).delete(id)
})
