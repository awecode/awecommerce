import { OfferConditionService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new OfferConditionService(useDb()).get(id), `Offer condition not found: ${id}`)
})
