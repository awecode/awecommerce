import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// Creates a site offer, a user offer or a voucher. A voucher needs a
// voucherCode; other offers cannot have one (422).
export default defineServiceHandler(async (event) => {
  const body = await readValidatedBody(event, createOfferSchema.parse)
  return await new OfferService(useDb()).create(body)
})
