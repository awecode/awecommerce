import { OfferRangeService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, offerRangeListQuery.parse)
  return await new OfferRangeService(useDb()).list({
    q: query.q,
    isActive: query.active,
    pagination: { page: query.page, size: query.size },
  })
})
