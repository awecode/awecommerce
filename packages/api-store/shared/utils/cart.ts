import { z } from 'zod'

// Request bodies for the cart routes, shared with the storefront's forms. Only
// the shape is checked here; the cart service checks the values (quantity of at
// least 1, answers that fit the product's fields) and answers with a 422.

const customizations = z.record(z.string(), z.string())

export const addCartLineSchema = z.object({
  variantId: z.number().int(),
  quantity: z.number().int(),
  customizations: customizations.optional(),
})

export const updateCartLineSchema = z
  .object({
    quantity: z.number().int().optional(),
    customizations: customizations.optional(),
  })
  .refine(
    (body) => body.quantity !== undefined || body.customizations !== undefined,
    'Pass quantity or customizations',
  )

export const applyVoucherSchema = z.object({
  code: z.string().trim().min(1),
})
