import { eq } from 'drizzle-orm'
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { OrderService } from '@awecommerce/service/apps/order/services/order'
import { ShippingAddressService } from '@awecommerce/service/apps/order/services/shipping-address'
import { users } from '../../../../../auth/server/db/schema'

// A person for their page: their account, their 5 latest orders (with how
// many they have), memberships, saved addresses and redeemable loyalty points
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, userParams.parse)
  const db = useDb()
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpires: users.banExpires,
    })
    .from(users)
    .where(eq(users.id, id))
  orNotFound(user, `User not found: ${id}`)
  const orders = await new OrderService(db).list({ userId: id, pagination: { page: 1, size: 5 } })
  const { totalRedeemablePoints, totalRedeemableValue } = await new LoyaltyService(db).getTotalRedeemablePointsAndValue(id)
  return {
    user: user!,
    orders: {
      results: orders.results.map(({ lines, ...order }) => ({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        items: lines.reduce((total, line) => total + line.quantity, 0),
      })),
      total: orders.pagination.total,
    },
    memberships: await new MembershipService(db).list({ userId: id }),
    addresses: await new ShippingAddressService(db).getAll(id),
    loyalty: { points: totalRedeemablePoints, value: totalRedeemableValue },
  }
})
