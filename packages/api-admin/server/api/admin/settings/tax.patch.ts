import { TaxService } from '@awecommerce/service/apps/tax/services/tax'

// Changes the given tax settings and returns all of them. Applies to carts and
// orders from now on; placed orders keep their tax.
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, taxSettingsSchema.parse)
  const taxService = new TaxService(useDb())
  await taxService.updateSettings(body)
  return await taxService.getSettings()
})
