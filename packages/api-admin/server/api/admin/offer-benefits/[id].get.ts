import { OfferBenefitService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new OfferBenefitService(useDb()).get(id), `Offer benefit not found: ${id}`)
})
