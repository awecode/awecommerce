import { TaxService } from '@awecommerce/service/apps/tax/services/tax'

export default defineServiceHandler(async () => {
  return await new TaxService(useDb()).getSettings()
})
