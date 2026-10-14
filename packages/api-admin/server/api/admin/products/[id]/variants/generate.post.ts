import { ProductVariantService } from '@awecommerce/service/apps/product/services/product'

// Creates a variant for every option combination the product does not have
// yet (at most 100). Returns the variants it created or changed.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { options } = await readValidatedBody(event, generateVariantsSchema.parse)
  return await new ProductVariantService(useDb()).generateVariants(id, options)
})
