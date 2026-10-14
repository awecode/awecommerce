import { BrandService } from '@awecommerce/service/apps/product/services/product'

// Active brands with a product the store shows
export default defineServiceHandler(async () => {
  return await new BrandService(useDb()).list({ isActive: true, hasListedProducts: true })
})
