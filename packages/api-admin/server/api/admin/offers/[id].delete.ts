import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Orders keep their own copy of the offers they used, so deleting is allowed
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new OfferService(useDb()).delete(id)
})
