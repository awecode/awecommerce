import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Sets the payment status by hand, for example for cash on delivery
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { paymentStatus } = await readValidatedBody(event, changePaymentStatusSchema.parse)
  const orderService = new OrderService(useDb())
  await orderService.changePaymentStatus(id, paymentStatus, (await currentAdmin(event)).id)
  return await orderService.get(id)
})
