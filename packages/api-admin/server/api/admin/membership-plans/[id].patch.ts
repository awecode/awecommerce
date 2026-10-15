import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateMembershipPlanSchema.parse)
  return await new MembershipService(useDb()).updatePlan(id, body)
})
