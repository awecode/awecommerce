import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Creates an offer with its own range, condition and benefit, in one go
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createOfferWithPartsSchema.parse)
  return await new OfferService(useDb()).createWithParts(body)
})
