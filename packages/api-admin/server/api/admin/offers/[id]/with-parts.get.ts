import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// The offer with its condition, benefit and `products` (with names), or
// `products: null` for a range the offer form cannot show, and its
// `includedUsers` with their emails
export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const offer = orNotFound(await new OfferService(useDb()).getWithParts(id), `Offer not found: ${id}`)
  const people = await usersById(offer.includedUserIds ?? [])
  return {
    ...offer,
    includedUsers: (offer.includedUserIds ?? []).map((userId) => ({ id: userId, email: people.get(userId)?.email ?? userId })),
  }
})
