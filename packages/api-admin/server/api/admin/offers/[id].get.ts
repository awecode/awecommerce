import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// The offer with its condition and benefit
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  return orNotFound(await new OfferService(useDb()).get(id), `Offer not found: ${id}`)
})
