import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'

// Memberships sold as products: a line whose variant is a membership term
// grants the plan when the order is paid (its months times the quantity, to
// the order's user), and the order's memberships are cancelled when it is
// cancelled or refunded. Each such line's note says where the membership is.
export default defineNitroPlugin(() => {
  const memberships = () => new MembershipService(useDb())
  const term = async (variantId: number) => (await memberships().termsForVariants([variantId])).get(variantId)

  registerFulfillment({
    name: 'memberships',
    match: async (line) => (await term(line.variantId)) !== undefined,
    on: {
      paid: async ({ order, lines }) => {
        if (!order.userId) {
          console.error(`Order ${order.id}: a membership needs a signed-in buyer, none was granted`)
          return
        }
        // Paid again after a payment change: what it granted stands
        if ((await memberships().forOrder(order.id)).some((membership) => membership.status === 'active')) return
        for (const line of lines) {
          const found = await term(line.variantId)
          if (!found) continue
          await memberships().grant({
            userId: order.userId,
            planId: found.planId,
            months: found.months * line.quantity,
            pricePaid: String((Number(line.price ?? 0) - Number(line.discount)) * line.quantity),
            orderId: order.id,
          })
        }
      },
      refunded: async ({ order }) => {
        await memberships().cancelForOrder(order.id, 'Order refunded')
      },
      cancelled: async ({ order }) => {
        await memberships().cancelForOrder(order.id, 'Order cancelled')
      },
    },
    note: async ({ order, line }) => {
      const found = await term(line.variantId)
      if (!found) return null
      const membership = (await memberships().forOrder(order.id)).find((m) => m.planId === found.planId)
      if (!membership) {
        return order.status === 'Cancelled'
          ? null
          : { title: `${found.plan.name} membership`, text: 'It starts once your payment is confirmed.' }
      }
      if (membership.status === 'cancelled') {
        return { title: `${found.plan.name} membership`, text: 'This membership was cancelled.' }
      }
      const { locale } = useRuntimeConfig().public.store
      const date = (value: string) => new Intl.DateTimeFormat(locale || 'en-US', { dateStyle: 'long' }).format(new Date(value))
      const started = new Date(membership.startsAt) <= new Date()
      return {
        title: `${found.plan.name} membership`,
        text: started
          ? `Active until ${date(membership.endsAt)}.`
          : `Starts ${date(membership.startsAt)} and runs until ${date(membership.endsAt)}.`,
      }
    },
  })
})
