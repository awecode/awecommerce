import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Creates a product with its first variant. Products start as Draft.
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createProductSchema.parse)
  return await new ProductService(useDb()).create(body)
})
