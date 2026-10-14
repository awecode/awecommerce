import { ProductService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const productService = new ProductService(useDb())
  const found = await productService.getBySlug(getRouterParam(event, 'slug')!)
  if (!found || !found.isActive) {
    throw createError({ statusCode: 404, message: 'Product not found' })
  }
  return await productService.get(found.id)
})
