import { ProductClassService } from '@awecommerce/service/apps/product/services/product'

// A product class with products cannot be deleted (409); deactivate it instead
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new ProductClassService(useDb()).delete(id)
})
