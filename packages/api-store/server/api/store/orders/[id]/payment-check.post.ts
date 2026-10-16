import { z } from 'zod'
import type { PaymentTry } from '@awecommerce/service/apps/order/services/order'

// Asks the gateway about the order's latest payment try while it is open (the
// order page calls this while it says "Confirming your payment"), and acts on
// the answer as a webhook would. Returns the order's `payment`, as the order
// route does.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int() }).parse)
  const { hash } = await readValidatedBody(event, z.object({ hash: z.string().optional() }).parse)
  const order = await buyerOrder(event, id, hash)
  const latest = (order.metadata as { payment?: PaymentTry } | null)?.payment
  const provider = paymentProvider(latest?.provider)
  if (!latest || latest.status !== 'open' || !provider || order.paymentStatus !== 'Pending') {
    return await orderPayment(order)
  }
  await settlePayment(event, order, provider, latest.reference)
  return await orderPayment(await buyerOrder(event, id, hash))
})
