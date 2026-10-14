import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'

export default defineServiceHandler(async () => {
  return await new LoyaltyService(useDb()).getSettings()
})
