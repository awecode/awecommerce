import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Changes the offer and the parts given; a part another offer shares is
// copied, so that offer keeps it
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateOfferWithPartsSchema.parse)
  return await new OfferService(useDb()).updateWithParts(id, body)
})
