import { z } from 'zod'
import type { PaymentTry } from '@awecommerce/service/apps/order/services/order'

// Where a gateway sends the buyer back, from the return or cancel link (with
// `cancelled=1`). Asks the gateway how the payment went and acts on it, then
// sends the buyer to the order page. The query alone is never trusted.
export default defineServiceHandler(async (event) => {
  const { provider: id } = await getValidatedRouterParams(event, z.object({ provider: z.string() }).parse)
  const query = await getValidatedQuery(
    event,
    z.object({ order: z.coerce.number().int(), hash: z.string(), cancelled: z.literal('1').optional() }).parse,
  )
  const order = await buyerOrder(event, query.order, query.hash)
  const provider = paymentProvider(id)
  const latest = (order.metadata as { payment?: PaymentTry } | null)?.payment
  if (provider && latest?.provider === provider.id && order.paymentStatus === 'Pending') {
    try {
      await settlePayment(event, order, provider, latest.reference, { cancelled: Boolean(query.cancelled) })
    } catch (error) {
      // The order page says it is being confirmed, and checks again
      console.error(`Order ${order.id}: could not check the payment with ${provider.id}`, error)
    }
  }
  return sendRedirect(event, `/orders/${order.id}?hash=${encodeURIComponent(query.hash)}`)
})
