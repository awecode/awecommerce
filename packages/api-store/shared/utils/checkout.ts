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

// A signed-in buyer's saved address
export const savedAddressSchema = shippingAddressSchema.extend({
  isDefault: z.boolean().optional(),
})

// How to reach a buyer who is not signed in
export const guestUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  phone: optionalText,
})

export const checkoutSchema = z
  .object({
    shippingMethodId: z.number().int().optional(),
    // The cart summary's `total` the buyer confirmed (with the same shipping
    // method and points). Checkout fails with a 409 if the order would cost
    // anything else.
    expectedTotal: z.string().regex(/^\d+(\.\d+)?$/),
    // An address, or the id of a saved one (signed in only)
    shippingAddress: shippingAddressSchema.optional(),
    shippingAddressId: z.number().int().optional(),
    // Required when not signed in
    guestUser: guestUserSchema.optional(),
    // Loyalty points to redeem (signed in only)
    redeemPoints: z.number().positive().optional(),
  })
  .refine(
    (body) => (body.shippingAddress === undefined) !== (body.shippingAddressId === undefined),
    'Pass shippingAddress or shippingAddressId',
  )
