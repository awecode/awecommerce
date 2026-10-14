import { ProductVariantService } from '@awecommerce/service/apps/product/services/product'

// Adds a variant, with its options, to a product
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, createVariantSchema.parse)
  return await new ProductVariantService(useDb()).create(id, body)
})
