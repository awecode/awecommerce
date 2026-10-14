import { BrandService } from '@awecommerce/service/apps/product/services/product'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new BrandService(useDb()).get(id), `Brand not found: ${id}`)
})
