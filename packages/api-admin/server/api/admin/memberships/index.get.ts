import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// Memberships, latest start first, one page at a time, each with its plan,
// `state` (active, upcoming, ended, cancelled) and `member` (name and email).
// `q` finds members by their email or name.
export default defineServiceHandler(async (event) => {
  const { page, size, q, plan, ...filters } = await getValidatedQuery(event, membershipListQuery.parse)
  const userIds = q ? await userIdsMatching(q) : undefined
  const { results, pagination } = await new MembershipService(useDb()).list({
    ...filters,
    userIds,
    planId: plan,
    pagination: { page, size },
  })
  const people = await usersById(results.flatMap((membership) => [membership.userId, membership.grantedBy]))
  return {
    results: results.map((membership) => ({
      ...membership,
      member: people.get(membership.userId) ?? null,
      grantedByEmail: membership.grantedBy ? (people.get(membership.grantedBy)?.email ?? null) : null,
    })),
    pagination,
  }
})
