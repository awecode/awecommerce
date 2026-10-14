import { OfferConditionService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createOfferConditionSchema.parse)
  return await new OfferConditionService(useDb()).create(body)
})
