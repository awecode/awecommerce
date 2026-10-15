import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Deletes the offer and the parts no other offer uses. Orders keep their own
// copy of the offers they used.
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return await new OfferService(useDb()).deleteWithParts(id)
})
