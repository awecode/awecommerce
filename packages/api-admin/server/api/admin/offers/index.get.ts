import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, offerListQuery.parse)
  return await new OfferService(useDb()).list({
    q: query.q,
    type: query.type,
    isActive: query.active,
    isFeatured: query.featured,
    condition: query.condition,
    benefit: query.benefit,
    pagination: { page: query.page, size: query.size },
  })
})
