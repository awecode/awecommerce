import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Moves the order to another status (not Cancelled: use cancel). Moving it to
// Shipped emails the customer, unless the order has nothing to ship.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { status } = await readValidatedBody(event, changeOrderStatusSchema.parse)
  const orderService = new OrderService(useDb())
  await orderService.changeStatus(id, status, (await currentAdmin(event)).id)
  const order = await orderService.get(id)
  // Only shipping is emailed. changeStatus refuses the status the order
  // already has, so this is a real change to Shipped.
  if (order && status === 'Shipped' && order.lines.some((line) => line.requiresShipping)) {
    await sendOrderEmail(event, 'shipped', order)
  }
  return order
})
