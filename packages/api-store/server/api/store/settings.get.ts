import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'

// The store's name, currency and locale, for showing prices
export default defineServiceHandler(async () => {
  return await new StoreSettingsService(useDb()).getSettings()
})
