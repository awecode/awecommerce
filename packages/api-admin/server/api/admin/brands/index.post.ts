import { BrandService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createBrandSchema.parse)
  return await new BrandService(useDb()).create(body)
})
