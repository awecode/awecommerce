import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// The signed-in buyer's memberships:
// - `current`: each plan they hold, wait for, or held until the last 90 days
//   (`state` active, upcoming or ended, `startsAt`, `endsAt`), with the
//   `terms` on sale to renew it (variant id, months, price). A renewal starts
//   when the current one ends; for an ended one, at once.
// - `history`: every membership, latest start first, with its `state`.
export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const service = new MembershipService(useDb())
  const current = await service.currentPlans(user.id)
  const terms = await service.termsOnSale(current.map((c) => c.plan.id))
  return {
    current: current.map(({ plan, ...rest }) => ({
      ...rest,
      plan: { id: plan.id, name: plan.name, program: plan.program },
      terms: terms.filter((term) => term.planId === plan.id),
    })),
    history: (await service.list({ userId: user.id })).map(({ id, plan, state, months, startsAt, endsAt, orderId, cancellationReason }) => ({
      id,
      plan,
      state,
      months,
      startsAt,
      endsAt,
      orderId,
      cancellationReason,
    })),
  }
})
