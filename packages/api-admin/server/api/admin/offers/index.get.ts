import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Offers, newest first, each with its benefit and condition (type and value)

export default defineServiceHandler(async (event) => {
  const query = await getValidatedQuery(event, offerListQuery.parse)
  return await new OfferService(useDb()).list({
    q: query.q,
    type: query.type,
    isActive: query.active,
    isFeatured: query.featured,
    condition: query.condition,
    benefit: query.benefit,
    state: query.state,
    pagination: { page: query.page, size: query.size },
  })
})
