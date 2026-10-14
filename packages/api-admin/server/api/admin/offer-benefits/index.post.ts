import { OfferBenefitService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createOfferBenefitSchema.parse)
  return await new OfferBenefitService(useDb()).create(body)
})
