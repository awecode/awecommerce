import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { OwnershipService } from '@awecommerce/service/apps/order/services/ownership'

// Once per person products (an ebook): when an order with one is paid, the
// buyer's other unpaid orders with it are duplicates. One still Pending that
// holds only things the buyer now owns (left behind, say, at a gateway) is
// cancelled, as the admin Cancel does: stock, offers and points go back, its
// cancelled hooks run, and the buyer is emailed unless it was to be paid
// online. Any other (confirmed by staff, or with something else in it, such
// as a mug) is left to staff, with a note in its history.
export default defineNitroPlugin(() => {
  const ownership = () => new OwnershipService(useDb())

  registerFulfillment({
    name: 'once-per-person',
    match: async (line) => (await ownership().singleVariants([line.variantId])).get(line.variantId) === 'once',
    on: {
      paid: async ({ event, order, lines }) => {
        if (!order.userId) return
        const orders = new OrderService(useDb())
        const variantIds = new Set(lines.map((line) => line.variantId))
        for (const id of await ownership().unpaidOrdersWith(order.userId, [...variantIds], order.id)) {
          const duplicate = (await orders.get(id))!
          const owned = await ownership().ownedVariants(order.userId, duplicate.lines.map((line) => line.variantId))
          if (duplicate.status === 'Pending' && duplicate.lines.every((line) => owned.has(line.variantId))) {
            await orders.cancel(id, 'system', `Bought in order ${order.id}`)
            await runFulfillment(event, 'cancelled', id)
            const cancelled = (await orders.get(id))!
            if (!paysOnline(cancelled)) await sendOrderEmail(event, 'cancelled', cancelled, { requestOrigin: getRequestURL(event).pathname.startsWith('/api/store/') })
          } else {
            const names = duplicate.lines.filter((line) => variantIds.has(line.variantId)).map((line) => line.productName)
            await orders.createLog(id, `The buyer bought ${names.join(', ')} in order ${order.id}, which is paid`)
          }
        }
      },
    },
  })
})
