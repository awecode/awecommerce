import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createShippingMethodSchema.parse)
  return await new ShippingMethodService(useDb()).create(body)
})
