import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Changes a product: its fields, status (publish with `Published`), flags,
// images or related products
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateProductSchema.parse)
  return await new ProductService(useDb()).update(id, body)
})
