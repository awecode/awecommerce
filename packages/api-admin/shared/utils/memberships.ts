import { z } from 'zod'

// Request bodies for the admin membership routes, shared with the
// backoffice's forms

const text = z.string().trim().min(1)
const months = z.number().int().min(1).max(120)

const planFields = z.object({
  name: text,
  slug: text,
  // Plans with the same program are tiers of one membership
  program: text,
  // Higher is better: a higher tier replaces a lower one
  rank: z.number().int().min(0),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
export const createMembershipPlanSchema = planFields
export const updateMembershipPlanSchema = planFields.partial()

// The variant that sells the plan, for how many months
export const membershipTermSchema = z.object({ variantId: z.number().int(), months })

// Grants a plan to a user; the same plan again extends (starts when the
// current one ends)
export const grantMembershipSchema = z.object({ userId: text, planId: z.number().int(), months })

export const cancelMembershipSchema = z.object({ reason: text })
