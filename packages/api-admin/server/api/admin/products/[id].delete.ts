import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Deletes a product with its variants. A product that was ordered cannot be
// deleted (409); deactivate it instead.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new ProductService(useDb()).delete(id)
})
