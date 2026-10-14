import { OrderService } from '@awecommerce/service/apps/order/services/order'

// On sign-in, the orders the buyer placed as a guest with the same email join
// their order history. Only for a verified email (magic link sign-in verifies
// it), so nobody can claim orders by signing up with someone else's email.
export default defineNitroPlugin(() => {
  onSignedIn(async ({ user }) => {
    if (!user.emailVerified) {
      return
    }
    try {
      await new OrderService(useDb()).claimGuestOrders(user.id, user.email)
    } catch (error) {
      // Signing in matters more; the orders can be linked on the next sign-in
      console.error('Could not link guest orders', error)
    }
  })
})
