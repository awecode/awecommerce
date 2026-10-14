import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

// Changes a method. Placed orders keep the name and price they were shipped with.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateShippingMethodSchema.parse)
  return await new ShippingMethodService(useDb()).update(id, body)
})
