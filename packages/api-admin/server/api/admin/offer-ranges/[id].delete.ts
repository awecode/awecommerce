import { OfferRangeService } from '@awecommerce/service/apps/offer/services/offer'

// A range that conditions still use cannot be deleted (409)
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new OfferRangeService(useDb()).delete(id)
})
