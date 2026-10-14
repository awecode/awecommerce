import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'

// Changes the given loyalty settings and returns all of them
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, loyaltySettingsSchema.parse)
  const loyaltyService = new LoyaltyService(useDb())
  await loyaltyService.updateSettings(body)
  return await loyaltyService.getSettings()
})
