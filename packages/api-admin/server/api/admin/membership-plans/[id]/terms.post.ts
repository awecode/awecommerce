import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// Makes a product variant sell the plan. A variant sells one term (409
// AlreadyExists otherwise); a missing variant gives 422.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, membershipTermSchema.parse)
  return await new MembershipService(useDb()).addTerm({ ...body, planId: id })
})
