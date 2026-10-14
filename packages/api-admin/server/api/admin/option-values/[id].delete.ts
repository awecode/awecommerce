import { ProductOptionService } from '@awecommerce/service/apps/product/services/product'

// Deletes an option value and removes it from every variant that uses it
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new ProductOptionService(useDb()).deleteValue(id)
})
