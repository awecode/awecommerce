import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'

export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, addressParams.parse)
  const body = await readValidatedBody(event, savedAddressSchema.partial().parse)
  return await new ShippingAddressService(useDb()).update(user.id, id, body)
})
