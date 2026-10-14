import { OfferBenefitService } from '@awecommerce/service/apps/offer/services/offer'

// A benefit that offers still use cannot be deleted (409)
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new OfferBenefitService(useDb()).delete(id)
})
