import { OrderService } from '@awecommerce/service/apps/order/services/order'

// An order with its lines, payments, `customer`, and log (status changes, who
// made them and their email). `payment`: its method (`online`: paid at a
// gateway) and whether it can be refunded through it (`canRefund`).
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const orderService = new OrderService(useDb())
  const order = orNotFound(await orderService.get(id), `Order not found: ${id}`)
  const logs = await orderService.getLogs(id)
  const people = await usersById([order.userId, ...logs.map((log) => log.loggedBy)])
  return {
    ...order,
    customer: customerOf(order, people),
    payment: adminOrderPayment(order),
    logs: logs.map((log) => ({ ...log, loggedByEmail: log.loggedBy ? (people.get(log.loggedBy)?.email ?? null) : null })),
  }
})
