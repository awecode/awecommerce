import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

export default defineServiceHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const body = await readValidatedBody(event, updateOfferSchema.parse)
  return await new OfferService(useDb()).update(id, body)
})
