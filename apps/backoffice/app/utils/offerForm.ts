import { z } from 'zod'

// The offer page's form: one offer with its products, condition and benefit,
// saved together through /api/admin/offers/with-parts

type Named = { id: number; name: string }
export type OfferType = 'site' | 'user' | 'voucher'
export type ConditionType = 'basket_quantity' | 'basket_total' | 'distinct_items'
export type BenefitType = 'percentage' | 'fixed_amount' | 'fixed_price' | 'free_shipping'

export type OfferForm = {
  name: string
  description: string
  type: OfferType
  voucherCode: string
  isActive: boolean
  // Who customer offers and vouchers are for
  everyone: boolean
  users: { id: string; email: string }[]
  planIds: number[]
  // Which products: all, or any of the chosen; minus the exceptions
  all: boolean
  products: Named[]
  categories: number[]
  brands: number[]
  productClasses: number[]
  exceptProducts: Named[]
  exceptCategories: number[]
  exceptBrands: number[]
  exceptProductClasses: number[]
  // The range form cannot show (made through the range routes): kept as is
  customRange: boolean
  conditionType: ConditionType
  conditionValue: string
  benefitType: BenefitType
  benefitValue: string
  maxAffectedItems: number | null
  // As a datetime-local value, or empty
  startDate: string
  endDate: string
  limitPerUser: number | null
  overallLimit: number | null
  priority: number
  combinesWithOtherOffers: boolean
  isFeatured: boolean
  image: string | null
}

export const emptyOfferForm = (): OfferForm => ({
  name: '',
  description: '',
  type: 'site',
  voucherCode: '',
  isActive: true,
  everyone: true,
  users: [],
  planIds: [],
  all: true,
  products: [],
  categories: [],
  brands: [],
  productClasses: [],
  exceptProducts: [],
  exceptCategories: [],
  exceptBrands: [],
  exceptProductClasses: [],
  customRange: false,
  conditionType: 'basket_quantity',
  conditionValue: '1',
  benefitType: 'percentage',
  benefitValue: '',
  maxAffectedItems: null,
  startDate: '',
  endDate: '',
  limitPerUser: null,
  overallLimit: null,
  priority: 0,
  combinesWithOtherOffers: true,
  isFeatured: false,
  image: null,
})

// A stored date as a datetime-local value in this browser's time zone, and back
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocal = (local: string) => (local ? new Date(local).toISOString() : null)
const trimDecimalValue = (value: string | null | undefined) => (value == null ? '' : String(Number(value)))

type Lists = { products: Named[]; categories: Named[]; brands: Named[]; productClasses: Named[] }
type OfferFromApi = {
  name: string
  description: string | null
  type: OfferType
  voucherCode: string | null
  isActive: boolean | null
  includeAllUsers: boolean | null
  includedUsers: { id: string; email: string }[]
  includedMembershipPlanIds: number[]
  products: (Lists & { all: boolean; except: Lists }) | null
  condition: { type: ConditionType; value: string }
  benefit: { type: BenefitType; value: string; maxAffectedItems: number | null }
  startDate: string | null
  endDate: string | null
  limitPerUser: number | null
  overallLimit: number | null
  priority: number | null
  combinesWithOtherOffers: boolean
  isFeatured: boolean | null
  image: string | null
}

export const offerFormFrom = (offer: OfferFromApi): OfferForm => {
  const ids = (rows: Named[]) => rows.map((row) => row.id)
  const products = offer.products
  return {
    ...emptyOfferForm(),
    name: offer.name,
    description: offer.description ?? '',
    type: offer.type,
    voucherCode: offer.voucherCode ?? '',
    isActive: offer.isActive ?? true,
    everyone: offer.includeAllUsers ?? false,
    users: offer.includedUsers,
    planIds: offer.includedMembershipPlanIds,
    ...(products
      ? {
          all: products.all,
          products: products.products,
          categories: ids(products.categories),
          brands: ids(products.brands),
          productClasses: ids(products.productClasses),
          exceptProducts: products.except.products,
          exceptCategories: ids(products.except.categories),
          exceptBrands: ids(products.except.brands),
          exceptProductClasses: ids(products.except.productClasses),
        }
      : { customRange: true }),
    conditionType: offer.condition.type,
    conditionValue: trimDecimalValue(offer.condition.value),
    benefitType: offer.benefit.type,
    benefitValue: offer.benefit.type === 'free_shipping' ? '' : trimDecimalValue(offer.benefit.value),
    maxAffectedItems: offer.benefit.maxAffectedItems,
    startDate: toLocal(offer.startDate),
    endDate: toLocal(offer.endDate),
    limitPerUser: offer.limitPerUser,
    overallLimit: offer.overallLimit,
    priority: offer.priority ?? 0,
    combinesWithOtherOffers: offer.combinesWithOtherOffers,
    isFeatured: offer.isFeatured ?? false,
    image: offer.image,
  }
}

// The request body for the with-parts routes
export const offerBody = (form: OfferForm) => ({
  name: form.name.trim(),
  description: form.description.trim() || null,
  type: form.type,
  voucherCode: form.type === 'voucher' ? form.voucherCode.trim() : null,
  isActive: form.isActive,
  includeAllUsers: form.type === 'site' ? false : form.everyone,
  includedUserIds: form.type === 'site' ? [] : form.users.map((user) => user.id),
  includedMembershipPlanIds: form.type === 'site' ? [] : form.planIds,
  ...(form.customRange
    ? {}
    : {
        products: {
          all: form.all,
          products: form.products.map((p) => p.id),
          categories: form.categories,
          brands: form.brands,
          productClasses: form.productClasses,
          except: {
            products: form.exceptProducts.map((p) => p.id),
            categories: form.exceptCategories,
            brands: form.exceptBrands,
            productClasses: form.exceptProductClasses,
          },
        },
      }),
  condition: { type: form.conditionType, value: form.conditionValue.trim() },
  benefit: {
    type: form.benefitType,
    value: form.benefitType === 'free_shipping' ? '0' : form.benefitValue.trim(),
    maxAffectedItems: form.benefitType === 'free_shipping' ? null : form.maxAffectedItems,
  },
  startDate: fromLocal(form.startDate),
  endDate: fromLocal(form.endDate),
  limitPerUser: form.limitPerUser,
  overallLimit: form.overallLimit,
  priority: form.priority,
  combinesWithOtherOffers: form.combinesWithOtherOffers,
  isFeatured: form.isFeatured,
  image: form.image,
})

const amount = z.string().trim().regex(/^\d+(\.\d+)?$/, 'Enter a number, such as 10 or 4.99')
export const offerFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name'),
    type: z.enum(['site', 'user', 'voucher']),
    voucherCode: z.string(),
    everyone: z.boolean(),
    users: z.array(z.unknown()),
    planIds: z.array(z.number()),
    all: z.boolean(),
    customRange: z.boolean(),
    products: z.array(z.unknown()),
    categories: z.array(z.number()),
    brands: z.array(z.number()),
    productClasses: z.array(z.number()),
    conditionValue: amount,
    benefitType: z.enum(['percentage', 'fixed_amount', 'fixed_price', 'free_shipping']),
    benefitValue: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  })
  .superRefine((form, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (form.type === 'voucher' && !form.voucherCode.trim()) issue('voucherCode', 'Enter the code buyers type in')
    if (form.type !== 'site' && !form.everyone && !form.users.length && !form.planIds.length) {
      issue('everyone', 'Choose who gets it: everyone, customers or members of plans')
    }
    if (!form.customRange && !form.all && !form.products.length && !form.categories.length && !form.brands.length && !form.productClasses.length) {
      issue('all', 'Choose some products, categories, brands or classes')
    }
    if (form.benefitType !== 'free_shipping') {
      if (!amount.safeParse(form.benefitValue).success) issue('benefitValue', 'Enter a number, such as 10 or 4.99')
      else if (form.benefitType === 'percentage' && Number(form.benefitValue) > 100) issue('benefitValue', 'A percentage is at most 100')
    }
    if (form.startDate && form.endDate && form.endDate <= form.startDate) issue('endDate', 'End after the start')
  })

export const offerTypeLabels: Record<OfferType, string> = { site: 'Automatic', user: 'Customers', voucher: 'Voucher' }

// "20% off", "$5 off each", "Sells at $10", "Free shipping"
export const benefitText = (type: BenefitType, value: string, money: (value: string | number) => string) =>
  type === 'percentage'
    ? `${Number(value)}% off`
    : type === 'fixed_amount'
      ? `${money(value)} off each`
      : type === 'fixed_price'
        ? `Sells at ${money(value)}`
        : 'Free shipping'

// "when a product reaches 2 units", "when they spend $50", "with 3 different products"
export const conditionText = (type: ConditionType, value: string, money: (value: string | number) => string) => {
  const n = Number(value)
  return type === 'basket_quantity'
    ? n <= 1
      ? 'on any quantity'
      : `when a product reaches ${n} units`
    : type === 'basket_total'
      ? `when these products come to ${money(value)}`
      : `with ${n} different product${n === 1 ? '' : 's'}`
}
