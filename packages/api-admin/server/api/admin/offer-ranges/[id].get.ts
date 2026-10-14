import { OfferRangeService } from '@awecommerce/service/apps/offer/services/offer'

// The range with its included and excluded products, brands, categories and classes
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new OfferRangeService(useDb()).get(id), `Offer range not found: ${id}`)
})
