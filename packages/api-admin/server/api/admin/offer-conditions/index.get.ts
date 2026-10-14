import { OfferConditionService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, offerConditionListQuery.parse)
  return await new OfferConditionService(useDb()).list({
    type: query.type,
    range: query.range,
    pagination: { page: query.page, size: query.size },
  })
})
