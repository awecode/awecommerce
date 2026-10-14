import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'

// Changes the given store settings and returns all of them. An unknown currency
// or locale gives 422.
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, storeSettingsSchema.parse)
  return await new StoreSettingsService(useDb()).updateSettings(body)
})
