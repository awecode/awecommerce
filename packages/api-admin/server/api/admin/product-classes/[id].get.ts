import { ProductClassService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new ProductClassService(useDb()).get(id), `Product class not found: ${id}`)
})
