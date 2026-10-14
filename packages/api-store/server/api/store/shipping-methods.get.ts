import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

export default defineServiceHandler(async () => {
  return await new ShippingMethodService(useDb()).list()
})
