import { z } from 'zod'

export const idParams = z.object({ id: z.coerce.number().int() })

// Ids as `1,2` or as a repeated parameter
const ids = z
  .preprocess(
    (value) => (typeof value === 'string' ? value.split(',') : value),
    z.array(z.coerce.number().int()),
  )
  .optional()

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
}

// Brands, categories and product classes
export const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
  active: z.stringbool().optional(),
  ...pageFields,
})

export const productListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(['Draft', 'Published']).optional(),
  active: z.stringbool().optional(),
  categories: ids,
  brands: ids,
  productClass: z.coerce.number().int().optional(),
  featured: z.stringbool().optional(),
  bestSeller: z.stringbool().optional(),
  sortBy: z.enum(['priceAsc', 'priceDesc']).optional(),
  ...pageFields,
})

// A record, or a 404 when there is none
export const orNotFound = <T>(record: T | null | undefined, message: string): T => {
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message })
  }
  return record
}
