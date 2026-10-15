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
  // Newest first when not given
  sortBy: z.enum(['priceAsc', 'priceDesc', 'nameAsc', 'nameDesc', 'newest', 'oldest']).optional(),
  ...pageFields,
})

export const offerRangeListQuery = listQuery

export const offerConditionListQuery = z.object({
  type: z.enum(['basket_quantity', 'basket_total', 'distinct_items']).optional(),
  range: z.coerce.number().int().optional(),
  ...pageFields,
})

export const offerBenefitListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  active: z.stringbool().optional(),
  type: z.enum(['fixed_amount', 'percentage', 'free_shipping', 'fixed_price']).optional(),
  ...pageFields,
})

export const offerListQuery = z.object({
  q: z.string().trim().min(1).optional(),
  type: z.enum(['site', 'user', 'voucher']).optional(),
  active: z.stringbool().optional(),
  featured: z.stringbool().optional(),
  condition: z.coerce.number().int().optional(),
  benefit: z.coerce.number().int().optional(),
  ...pageFields,
})

export const orderListQuery = z.object({
  // An order id, a user id, or part of the guest's email
  q: z.string().trim().min(1).optional(),
  status: z.enum(['Pending', 'Confirmed', 'Processing', 'Processed', 'Couriered', 'Shipped', 'Delivered', 'Returned', 'Cancelled', 'Completed']).optional(),
  // Active: not completed or cancelled; Inactive: completed or cancelled
  tab: z.enum(['Active', 'Inactive', 'Cancelled', 'Completed']).optional(),
  paymentStatus: z.enum(['Pending', 'Paid', 'Refunded']).optional(),
  userId: z.string().min(1).optional(),
  // Orders placed on this day, as YYYY-MM-DD
  createdAt: z.iso.date().optional(),
  ...pageFields,
})

export const membershipListQuery = z.object({
  // Part of the member's email or name
  q: z.string().trim().min(1).optional(),
  userId: z.string().min(1).optional(),
  plan: z.coerce.number().int().optional(),
  state: z.enum(['active', 'upcoming', 'ended', 'cancelled']).optional(),
  ...pageFields,
})

export const userListQuery = z.object({
  // Part of the email
  q: z.string().trim().min(1).optional(),
  role: z.enum(['admin', 'user']).optional(),
  ...pageFields,
})

export const userParams = z.object({ id: z.string().min(1) })

// A record, or a 404 when there is none
export const orNotFound = <T>(record: T | null | undefined, message: string): T => {
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message })
  }
  return record
}
