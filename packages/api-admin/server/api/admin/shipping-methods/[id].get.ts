import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new ShippingMethodService(useDb()).get(id), `Shipping method not found: ${id}`)
})
