import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ValidationError } from '@awecommerce/service/core/errors'

// Refunds the order's payment in full through its payment provider (such as
// back to the card), records the refund, marks the order Refunded, and runs
// the refunded fulfilment hooks. For orders whose `payment.canRefund` is true.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const orders = new OrderService(useDb())
  const order = orNotFound(await orders.get(id), `Order not found: ${id}`)
  const payment = refundablePayment(order)
  const provider = paymentProvider(order.paymentMethod)
  if (!payment || !provider?.refund) {
    throw new ValidationError('This order cannot be refunded through its payment method')
  }
  const refund = await provider.refund({ event, order, payment })
  await orders.recordRefund(id, {
    amount: payment.amount,
    reference: refund.reference,
    method: provider.id,
    label: provider.label,
    refundedBy: (await currentAdmin(event)).id,
  })
  await runFulfillment(event, 'refunded', id)
  return await orders.get(id)
})
