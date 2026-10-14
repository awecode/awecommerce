import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Cancels the order: gives back its offer usage and redeemed loyalty points
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { reason, remarks } = await readValidatedBody(event, cancelOrderSchema.parse)
  const orderService = new OrderService(useDb())
  await orderService.cancel(id, (await currentAdmin(event)).id, reason, remarks)
  return await orderService.get(id)
})
