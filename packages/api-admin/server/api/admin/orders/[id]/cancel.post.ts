import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Cancels the order: gives back its offer usage and redeemed loyalty points,
// runs the cancelled fulfilment hooks, and emails the customer the reason
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { reason, remarks } = await readValidatedBody(event, cancelOrderSchema.parse)
  const orderService = new OrderService(useDb())
  await orderService.cancel(id, (await currentAdmin(event)).id, reason, remarks)
  await runFulfillment(event, 'cancelled', id)
  const order = await orderService.get(id)
  // With the reason; the remarks are for staff only
  if (order) await sendOrderEmail(event, 'cancelled', order)
  return order
})
