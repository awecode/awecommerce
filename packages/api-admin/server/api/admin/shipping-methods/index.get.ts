import { ShippingMethodService } from '@awecommerce/service/apps/order/services/shipping-method'

// Every shipping method, newest first
export default defineServiceHandler(async () => {
  return await new ShippingMethodService(useDb()).list()
})
