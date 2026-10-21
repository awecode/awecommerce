import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, planListQuery.parse)
  return await new MembershipService(useDb()).listPlans({
    q: query.q,
    isActive: query.active,
    ids: query.ids,
    pagination: { page: query.page, size: query.size },
  })
})
