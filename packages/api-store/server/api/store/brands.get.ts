import { BrandService } from '@awecommerce/service/apps/product/services/product'

// Active brands that have active products
export default defineServiceHandler(async () => {
  return await new BrandService(useDb()).list({ isActive: true, hasActiveProducts: true })
})
