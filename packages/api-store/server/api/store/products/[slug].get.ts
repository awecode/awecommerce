import { ProductService } from '@awecommerce/service/apps/product/services/product'

// A listed product with its active variants and listed related products
export default defineServiceHandler(async (event) => {
  const productService = new ProductService(useDb())
  const found = await productService.getBySlug(getRouterParam(event, 'slug')!)
  const product = found && isListed(found) ? await productService.get(found.id) : null
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Product not found' })
  }
  return {
    ...product,
    variants: product.variants.filter((variant) => variant.isActive).map(storeVariant),
    relatedProducts: product.relatedProducts.filter(isListed),
  }
})
