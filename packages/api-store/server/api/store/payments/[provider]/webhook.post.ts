import { z } from 'zod'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

// A gateway's webhook. The provider checks its signature and says which order
// and payment it is about; the payment is then checked with the gateway and
// acted on (recorded once, however often the webhook comes).
export default defineServiceHandler(async (event) => {
  const { provider: id } = await getValidatedRouterParams(event, z.object({ provider: z.string() }).parse)
  const provider = paymentProvider(id)
  if (!provider?.webhook) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No webhook for ${id}` })
  }
  const about = await provider.webhook(event)
  if (!about) return { received: true }
  const order = await new OrderService(useDb()).get(about.orderId)
  if (!order) {
    console.warn(`${id} webhook: order ${about.orderId} not found`)
    return { received: true }
  }
  await settlePayment(event, order, provider, about.reference)
  return { received: true }
})
