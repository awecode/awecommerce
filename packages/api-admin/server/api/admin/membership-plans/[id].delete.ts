import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// 409 InUse while memberships use it; its terms go with it
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new MembershipService(useDb()).deletePlan(id)
})
