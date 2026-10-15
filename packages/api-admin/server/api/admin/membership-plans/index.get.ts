import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, listQuery.parse)
  return await new MembershipService(useDb()).listPlans({
    q: query.q,
    isActive: query.active,
    pagination: { page: query.page, size: query.size },
  })
})
