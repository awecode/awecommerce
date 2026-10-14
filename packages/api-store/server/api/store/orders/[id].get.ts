import { z } from 'zod'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

// An order for its page.
// - With the hash from checkout: for whoever holds the link, signed in or not.
// - Without it: only for its signed-in owner (401 when signed out).
// A wrong hash, or someone else's order, looks the same as a missing order.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int() }).parse)
  const { hash } = await getValidatedQuery(event, z.object({ hash: z.string().optional() }).parse)
  const orderService = new OrderService(useDb())
  const order =
    hash !== undefined
      ? await orderService.getByHash(id, hash)
      : await orderService.get(id, (await requireUser(event)).id)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }
  return order
})
