import { OfferBenefitService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, offerBenefitListQuery.parse)
  return await new OfferBenefitService(useDb()).list({
    q: query.q,
    isActive: query.active,
    type: query.type,
    pagination: { page: query.page, size: query.size },
  })
})
