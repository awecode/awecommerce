import { z } from 'zod'

// Request bodies for the admin order and user routes, shared with the
// backoffice's forms

export const orderStatus = z.enum([
  'Pending',
  'Confirmed',
  'Processing',
  'Processed',
  'Couriered',
  'Shipped',
  'Delivered',
  'Returned',
  'Completed',
])

// Cancelled is not a status to set: cancelling also gives back offer usage and
// loyalty points (use the cancel route)
export const changeOrderStatusSchema = z.object({ status: orderStatus })

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1),
  remarks: z.string().trim().min(1).optional(),
})

export const changePaymentStatusSchema = z.object({
  paymentStatus: z.enum(['Pending', 'Paid', 'Refunded']),
})

// admin: staff, with access to the backoffice; user: a customer
export const changeUserRoleSchema = z.object({ role: z.enum(['admin', 'user']) })

export const banUserSchema = z.object({
  reason: z.string().trim().min(1).optional(),
  // Lifts the ban after this many days; forever when not given
  days: z.number().int().min(1).optional(),
})
