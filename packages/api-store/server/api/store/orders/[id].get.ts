import { z } from 'zod'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

// An order for its confirmation page. The hash from checkout proves the
// caller placed it; a wrong hash looks the same as a missing order.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int() }).parse)
  const { hash } = await getValidatedQuery(event, z.object({ hash: z.string() }).parse)
  const order = await new OrderService(useDb()).getByHash(id, hash)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }
  return order
})
