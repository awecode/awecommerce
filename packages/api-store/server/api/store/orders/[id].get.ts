import { z } from 'zod'

// An order for its page, for whoever holds its link (`hash`) or its signed-in
// owner (see buyerOrder). Each line has the fulfilment `note` for the buyer,
// or null. `payment`: the method, and for an unpaid online payment whether
// the buyer can pay now (`canPay`), with which `methods`, and how the latest
// try went (`latestTry`: open or failed, with a message).
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int() }).parse)
  const { hash } = await getValidatedQuery(event, z.object({ hash: z.string().optional() }).parse)
  const order = await buyerOrder(event, id, hash)
  const notes = await fulfillmentNotes(order.id)
  return {
    ...order,
    lines: order.lines.map((line) => ({ ...line, note: notes.get(line.id) ?? null })),
    payment: await orderPayment(order),
  }
})
