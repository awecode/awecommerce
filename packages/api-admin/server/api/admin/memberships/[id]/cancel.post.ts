import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// Ends a running membership now, or one waiting to start. 422 if already
// cancelled.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { reason } = await readValidatedBody(event, cancelMembershipSchema.parse)
  return await new MembershipService(useDb()).cancel(id, reason)
})
