import { z } from 'zod'

// Request bodies for the admin settings and shipping routes, shared with the
// backoffice's forms

const decimal = z.string().regex(/^\d+(\.\d+)?$/)

// Any of the fields; the others keep their values
export const taxSettingsSchema = z.object({
  // Whether product and shipping prices already include tax
  pricesIncludeTax: z.boolean().optional(),
  // Percentage, for products whose class has no rate (13 for 13%)
  defaultRate: decimal.optional(),
  // Whether shipping is taxed, at the default rate
  taxShipping: z.boolean().optional(),
})

// Any of the fields; the others keep their values
export const loyaltySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  // Points per unit of money spent, when the app awards them
  earnRate: decimal.nullable().optional(),
  // Money per point when redeemed; points cannot be redeemed without it
  redeemRate: decimal.nullable().optional(),
  // Points expire this many days after they are earned; empty for never
  expiresAfterInDays: z.number().int().min(1).nullable().optional(),
})

const shippingMethodFields = z.object({
  name: z.string().trim().min(1),
  price: decimal,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const createShippingMethodSchema = shippingMethodFields
export const updateShippingMethodSchema = shippingMethodFields.partial()
