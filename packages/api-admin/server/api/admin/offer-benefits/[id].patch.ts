import { OfferBenefitService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateOfferBenefitSchema.parse)
  return await new OfferBenefitService(useDb()).update(id, body)
})
