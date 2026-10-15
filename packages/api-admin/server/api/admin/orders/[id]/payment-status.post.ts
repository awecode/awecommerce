import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Sets the payment status by hand, for example for cash on delivery. A change
// to Paid runs the paid fulfilment hooks.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { paymentStatus } = await readValidatedBody(event, changePaymentStatusSchema.parse)
  const orderService = new OrderService(useDb())
  const before = await orderService.get(id)
  await orderService.changePaymentStatus(id, paymentStatus, (await currentAdmin(event)).id)
  if (paymentStatus === 'Paid' && before?.paymentStatus !== 'Paid') await runFulfillment(event, 'paid', id)
  return await orderService.get(id)
})
