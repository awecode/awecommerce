import { ProductService } from '@awecommerce/service/apps/product/services/product'

// Publishes, unpublishes, activates or deactivates up to 100 products at once:
// all of them, or none when one is missing (404)
export default defineServiceHandler(async (event) => {
  const { ids, changes } = await readValidatedBody(event, bulkProductSchema.parse)
  const updated = await new ProductService(useDb()).updateMany(ids, changes)
  return { updated: updated.map((product) => product.id) }
})
