import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'

// The signed-in buyer's saved addresses, newest first
export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  return await new ShippingAddressService(useDb()).getAll(user.id)
})
