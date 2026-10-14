import { ProductService } from '@awecommerce/service/apps/product/services/product'

// A listed product with its active variants and listed related products. Each
// variant says whether it is in stock: its stock is not counted (the product
// class does not track stock), or some is left.
export default defineServiceHandler(async (event) => {
  const productService = new ProductService(useDb())
  const found = await productService.getBySlug(getRouterParam(event, 'slug')!)
  const isListed = found && (await productService.listedProductIds([found.id])).length > 0
  const product = isListed ? await productService.get(found.id) : null
  if (!product) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Product not found' })
  }
  const listedRelated = new Set(
    await productService.listedProductIds(product.relatedProducts.map((related) => related.id)),
  )
  return {
    ...product,
    variants: product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        ...storeVariant(variant),
        inStock: product.productClass?.trackStock === false || (variant.stockQuantity ?? 0) > 0,
      })),
    relatedProducts: product.relatedProducts.filter((related) => listedRelated.has(related.id)),
  }
})
