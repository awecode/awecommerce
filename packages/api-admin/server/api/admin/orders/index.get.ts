import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Orders, newest first, one page at a time
export default defineServiceHandler(async (event) => {
  const { page, size, ...filters } = await getValidatedQuery(event, orderListQuery.parse)
  return await new OrderService(useDb()).list({ ...filters, pagination: { page, size } })
})
