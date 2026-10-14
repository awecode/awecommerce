import { ProductService } from '@awecommerce/service/apps/product/services/product'

// A product with all its variants (costs included), options, images and
// related products
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new ProductService(useDb()).get(id), `Product not found: ${id}`)
})
