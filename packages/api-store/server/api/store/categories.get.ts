import { CategoryService } from '@awecommerce/service/apps/product/services/product'

// Active categories, each with its parent, for building the menu
export default defineServiceHandler(async () => {
  return await new CategoryService(useDb()).list({ isActive: true })
})
