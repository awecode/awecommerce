import type { H3Event } from 'h3'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

// The order a buyer may see or pay:
// - With the hash from checkout: for whoever holds the link, signed in or not.
// - Without it: only for its signed-in owner (401 when signed out).
// A wrong hash, or someone else's order, is a 404 like a missing order.
export const buyerOrder = async (event: H3Event, id: number, hash: string | undefined) => {
  const orders = new OrderService(useDb())
  const order = hash !== undefined ? await orders.getByHash(id, hash) : await orders.get(id, (await requireUser(event)).id)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }
  return order
}
