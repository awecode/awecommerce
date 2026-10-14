import { z } from 'zod'

// Ids as `1,2` or as a repeated parameter
const ids = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.split(',') : value),
    z.array(z.coerce.number().int()),
  )
  .optional()

// Query of the store's product list, shared with the storefront's filters
export const productListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  categories: ids,
  brands: ids,
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  // Newest first when not given
  sortBy: z.enum(['priceAsc', 'priceDesc']).optional(),
  featured: z.stringbool().optional(),
  bestSeller: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
})
