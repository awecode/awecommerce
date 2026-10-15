import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// The plan with its terms, each with the variant and product that sell it
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new MembershipService(useDb()).getPlan(id), `Membership plan not found: ${id}`)
})
