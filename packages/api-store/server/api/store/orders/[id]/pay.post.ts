import { z } from 'zod'
import { ValidationError } from '@awecommerce/service/core/errors'

// Pay now: for an unpaid order with an online payment method, the buyer picks
// any of its `payment.methods`. An online one starts a new payment:
// `redirectUrl` is where to send the buyer. An offline one (such as cash on
// delivery) only switches the order to it: `redirectUrl` is null.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int() }).parse)
  const { paymentMethod, hash } = await readValidatedBody(event, payOrderSchema.parse)
  const order = await buyerOrder(event, id, hash)
  const payment = await orderPayment(order)
  if (!payment.canPay) {
    throw new ValidationError('This order cannot be paid now')
  }
  if (!payment.methods.some((method) => method.id === paymentMethod)) {
    throw new ValidationError(`${paymentMethod} cannot pay for this order`)
  }
  return await startPayment(event, order, paymentProvider(paymentMethod)!)
})
