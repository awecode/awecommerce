import { z } from 'zod'

// Request bodies for the admin offer routes, shared with the backoffice's forms.
// An offer is built from a range (which products), a condition (when it
// applies) and a benefit (what the buyer gets).

const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const text = z.string().trim().min(1)
const optionalText = z.string().nullable().optional()
const ids = z.array(z.number().int())

const rangeFields = z.object({
  name: text,
  description: optionalText,
  isActive: z.boolean().optional(),
  // false: a product is in the range when it matches any included list.
  // true: it must match every list (products, brands, categories, classes).
  inclusiveFilter: z.boolean().optional(),
  includeAllProducts: z.boolean().optional(),
  includeAllBrands: z.boolean().optional(),
  includeAllCategories: z.boolean().optional(),
  includeAllProductClasses: z.boolean().optional(),
  // Ids; each list replaces the range's list
  includedProducts: ids.optional(),
  excludedProducts: ids.optional(),
  includedBrands: ids.optional(),
  excludedBrands: ids.optional(),
  includedCategories: ids.optional(),
  excludedCategories: ids.optional(),
  includedProductClasses: ids.optional(),
  excludedProductClasses: ids.optional(),
})
export const createOfferRangeSchema = rangeFields
export const updateOfferRangeSchema = rangeFields.partial()

export const offerConditionType = z.enum(['basket_quantity', 'basket_total', 'distinct_items'])
export const createOfferConditionSchema = z.object({
  rangeId: z.number().int(),
  type: offerConditionType,
  // A quantity, an amount or a number of products, depending on the type
  value: decimal,
})
export const updateOfferConditionSchema = createOfferConditionSchema.omit({ rangeId: true }).partial()

export const offerBenefitType = z.enum(['fixed_amount', 'percentage', 'free_shipping', 'fixed_price'])
const benefitFields = z.object({
  name: text,
  description: optionalText,
  type: offerBenefitType,
  // An amount, a percentage or a price, depending on the type (0 for free shipping)
  value: decimal,
  // At most this many units per line get the benefit; empty for all
  maxAffectedItems: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
})
export const createOfferBenefitSchema = benefitFields
export const updateOfferBenefitSchema = benefitFields.partial()

const dateTime = z.iso.datetime({ offset: true }).nullable().optional()
const offerFields = z.object({
  name: text,
  description: optionalText,
  image: optionalText,
  // site: every cart; user: the users it targets; voucher: entered by code
  type: z.enum(['site', 'user', 'voucher']),
  // Required for vouchers, not allowed for other offers
  voucherCode: z.string().trim().min(1).nullable().optional(),
  // Who user offers and vouchers are for; ignored by site offers
  includeAllUsers: z.boolean().optional(),
  includedUserIds: z.array(z.string()).optional(),
  // Members of these plans get it too
  includedMembershipPlanIds: z.array(z.number().int()).optional(),
  // Off: not added to other offers; the cart gets the bigger discount
  combinesWithOtherOffers: z.boolean().optional(),
  conditionId: z.number().int(),
  benefitId: z.number().int(),
  startDate: dateTime,
  endDate: dateTime,
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  // Higher applies first
  priority: z.number().int().optional(),
  limitPerUser: z.number().int().min(1).nullable().optional(),
  overallLimit: z.number().int().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export const createOfferSchema = offerFields
export const updateOfferSchema = offerFields.partial()

// One offer with its parts, as the backoffice's offer form saves it. Which
// products: every product (`all`), or those in any of the lists; minus the
// `except` lists either way.
const productLists = z.object({ products: ids.optional(), categories: ids.optional(), brands: ids.optional(), productClasses: ids.optional() })
export const offerProductsSchema = productLists.extend({ all: z.boolean(), except: productLists.optional() })
const offerWithPartsFields = offerFields.omit({ conditionId: true, benefitId: true }).extend({
  products: offerProductsSchema,
  condition: z.object({ type: offerConditionType, value: decimal }),
  benefit: z.object({ type: offerBenefitType, value: decimal, maxAffectedItems: z.number().int().min(1).nullable().optional() }),
})
export const createOfferWithPartsSchema = offerWithPartsFields
export const updateOfferWithPartsSchema = offerWithPartsFields.partial()
