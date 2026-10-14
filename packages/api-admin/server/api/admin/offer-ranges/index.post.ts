import { OfferRangeService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createOfferRangeSchema.parse)
  return await new OfferRangeService(useDb()).create(body)
})
