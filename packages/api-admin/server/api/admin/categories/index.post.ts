import { CategoryService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createCategorySchema.parse)
  return await new CategoryService(useDb()).create(body)
})
