import { ProductVariantService } from '@awecommerce/service/apps/product/services/product'

// A variant that was ordered cannot be deleted (409); deactivate it instead
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new ProductVariantService(useDb()).delete(id)
})
