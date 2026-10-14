import { StoreSettingsService } from '@awecommerce/service/apps/store/services/store'

export default defineServiceHandler(async () => {
  return await new StoreSettingsService(useDb()).getSettings()
})
