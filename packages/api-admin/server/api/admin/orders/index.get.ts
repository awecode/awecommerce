import { OrderService } from '@awecommerce/service/apps/order/services/order'

// Orders, newest first, one page at a time, each with its `customer` and its
// number of `items` (not its lines: open the order for those). `q` also finds
// members by their email or name.
export default defineServiceHandler(async (event) => {
  const { page, size, ...filters } = await getValidatedQuery(event, orderListQuery.parse)
  const qUserIds = filters.q ? await userIdsMatching(filters.q) : undefined
  const { results, pagination } = await new OrderService(useDb()).list({ ...filters, qUserIds, pagination: { page, size } })
  const people = await usersById(results.map((order) => order.userId))
  return {
    results: results.map(({ lines, ...order }) => ({
      ...order,
      items: lines.reduce((total, line) => total + line.quantity, 0),
      customer: customerOf(order, people),
    })),
    pagination,
  }
})
