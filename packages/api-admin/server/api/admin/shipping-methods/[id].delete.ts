import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

// Placed orders keep their own copy of the method, so deleting is allowed
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new ShippingMethodService(useDb()).delete(id)
})
