import { OfferConditionService } from '@awecommerce/service/apps/offer/services/offer'

// A condition that offers still use cannot be deleted (409)
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new OfferConditionService(useDb()).delete(id)
})
