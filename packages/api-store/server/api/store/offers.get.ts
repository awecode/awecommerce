import { OfferService } from '@awecommerce/service/apps/offer/services/offer'

// The featured offers anyone can use now (automatic ones, and vouchers open
// to every customer), for the home page: name, description, image, `type`,
// the `voucherCode` to type in, `endDate`, and the `benefit` and `condition`
// (type and value). Highest priority first.
export default defineServiceHandler(async () => {
  return (await new OfferService(useDb()).featuredForEveryone()).map(
    ({ id, name, description, image, type, voucherCode, endDate, benefit, condition }) => ({
      id,
      name,
      description,
      image,
      type,
      voucherCode,
      endDate,
      benefit,
      condition,
    }),
  )
})
