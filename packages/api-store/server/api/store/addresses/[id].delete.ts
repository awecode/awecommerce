import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'

export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, addressParams.parse)
  return await new ShippingAddressService(useDb()).delete(id, user.id)
})
