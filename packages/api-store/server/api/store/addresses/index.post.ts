import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'

// Saves an address. A default one replaces the previous default.
export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, savedAddressSchema.parse)
  return await new ShippingAddressService(useDb()).create({ ...body, userId: user.id })
})
