import { ProductClassService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createProductClassSchema.parse)
  return await new ProductClassService(useDb()).create(body)
})
