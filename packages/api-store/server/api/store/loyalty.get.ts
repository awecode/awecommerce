import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'

// The signed-in buyer's points that can be redeemed now, and what they are worth
export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  const loyaltyService = new LoyaltyService(useDb())
  const settings = await loyaltyService.getSettings()
  const { totalRedeemablePoints, totalRedeemableValue } =
    await loyaltyService.getTotalRedeemablePointsAndValue(user.id)
  return {
    // Points can be redeemed at checkout only while this is true
    canRedeem: Boolean(settings.isEnabled && settings.redeemRate),
    redeemRate: settings.redeemRate,
    points: totalRedeemablePoints,
    value: totalRedeemableValue,
  }
})
