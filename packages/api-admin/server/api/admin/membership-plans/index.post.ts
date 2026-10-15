import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createMembershipPlanSchema.parse)
  return await new MembershipService(useDb()).createPlan(body)
})
