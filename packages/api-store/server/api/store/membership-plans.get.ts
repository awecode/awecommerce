import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// The membership plans on sale, for anyone: each plan (name, program,
// description) with its `terms` (variant id, months, price), by program. For
// a signed-in buyer, only the plans they can join (as `toJoin` in
// /api/store/memberships), with `replaces` naming the plan an upgrade
// replaces.
export default defineServiceHandler(async (event) => {
  const user = await getUser(event)
  return (await new MembershipService(useDb()).plansToJoin(user?.id)).map(({ plan, replaces, terms }) => ({
    plan: { id: plan.id, name: plan.name, program: plan.program, description: plan.description },
    replaces,
    terms: terms.map(({ id, variantId, months, price }) => ({ id, variantId, months, price })),
  }))
})
