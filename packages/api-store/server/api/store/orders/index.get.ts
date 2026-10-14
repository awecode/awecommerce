import { z } from 'zod'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})

// The signed-in buyer's orders, newest first, one page at a time
export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const { page, size } = await getValidatedQuery(event, query.parse)
  return await new OrderService(useDb()).list({ userId: user.id, pagination: { page, size } })
})
