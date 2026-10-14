import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Moves the order to another status (not Cancelled: use cancel)
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { status } = await readValidatedBody(event, changeOrderStatusSchema.parse)
  const orderService = new OrderService(useDb())
  await orderService.changeStatus(id, status, (await currentAdmin(event)).id)
  return await orderService.get(id)
})
