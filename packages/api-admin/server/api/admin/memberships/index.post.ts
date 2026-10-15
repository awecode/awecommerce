import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// Grants a plan to a user, recorded as given by the signed-in admin. The
// same plan again extends it (it starts when the current one ends); a higher
// tier replaces the lower one. An inactive plan cannot be granted (422).
export default defineServiceHandler(async (event) => {
  const { userId, planId, months } = await readValidatedBody(event, grantMembershipSchema.parse)
  const service = new MembershipService(useDb())
  const plan = orNotFound(await service.getPlan(planId), `Membership plan not found: ${planId}`)
  if (!plan.isActive) {
    throw createError({ statusCode: 422, statusMessage: 'Unprocessable Entity', message: `${plan.name} is not active` })
  }
  if (!(await usersById([userId])).has(userId)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `User not found: ${userId}` })
  }
  return await service.grant({ userId, planId, months, grantedBy: (await currentAdmin(event)).id })
})
