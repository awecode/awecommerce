import { z } from 'zod'

// Request bodies for checkout, shared with the storefront's forms

const optionalText = z.string().trim().optional()

export const shippingAddressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: optionalText,
  houseNo: optionalText,
  city: z.string().trim().min(1),
  province: optionalText,
  postalCode: optionalText,
  country: z.string().trim().min(1),
  countryCode: optionalText,
  instructions: optionalText,
})

// How to reach a buyer who is not signed in
export const guestUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  phone: optionalText,
})

export const checkoutSchema = z.object({
  shippingMethodId: z.number().int().optional(),
  // The cart summary's `total` the buyer confirmed. Checkout fails with a 409
  // if the order would cost anything else.
  expectedTotal: z.string().regex(/^\d+(\.\d+)?$/),
  shippingAddress: shippingAddressSchema,
  guestUser: guestUserSchema,
})
