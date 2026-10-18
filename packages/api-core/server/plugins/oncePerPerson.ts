import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { OwnershipService } from '@awecommerce/service/apps/order/services/ownership'

// Once per person products (an ebook): when an order with one is paid, the
// buyer's other orders with it that are still pending and unpaid (left
// behind, say, at a gateway) are cancelled, as the admin Cancel does: stock,
// offers and points go back, their cancelled hooks run, and the buyer is
// emailed unless the order was to be paid online.
export default defineNitroPlugin(() => {
  const ownership = () => new OwnershipService(useDb())

  registerFulfillment({
    name: 'once-per-person',
    match: async (line) => (await ownership().singleVariants([line.variantId])).get(line.variantId) === 'once',
    on: {
      paid: async ({ event, order, lines }) => {
        if (!order.userId) return
        const orders = new OrderService(useDb())
        const variantIds = lines.map((line) => line.variantId)
        for (const id of await ownership().unpaidOrdersWith(order.userId, variantIds, order.id)) {
          await orders.cancel(id, 'system', `Bought in order ${order.id}`)
          await runFulfillment(event, 'cancelled', id)
          const cancelled = await orders.get(id)
          if (cancelled && !paysOnline(cancelled)) await sendOrderEmail(event, 'cancelled', cancelled, { requestOrigin: getRequestURL(event).pathname.startsWith('/api/store/') })
        }
      },
    },
  })
})
