import { OrderService } from '@awecommerce/service/apps/order/services/order'

// An order with its lines, payments and log (status changes and who made them)
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const orderService = new OrderService(useDb())
  const order = orNotFound(await orderService.get(id), `Order not found: ${id}`)
  return { ...order, logs: await orderService.getLogs(id) }
})
