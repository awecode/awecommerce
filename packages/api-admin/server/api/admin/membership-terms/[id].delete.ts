import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// The variant no longer sells the plan; memberships already bought stay.
// Answers 204.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  await new MembershipService(useDb()).removeTerm(id)
  return null
})
