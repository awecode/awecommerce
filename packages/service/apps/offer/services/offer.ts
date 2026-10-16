import { Exact, paginate } from '../../../core/pagination'
import { NotFoundError, ValidationError } from '../../../core/errors'
import { CartContent, Database } from '../../types'
import {
  and,
  desc,
  getTableColumns,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  SQL,
  sql,
} from 'drizzle-orm'
import { cartAppliedVoucherOffers } from '../../cart/schemas'
import {
  brands,
  categories,
  productClasses,
  products,
} from '../../product/schemas'
import { minVariantPrice } from '../../product/services/product'
import {
  NewOffer,
  NewOfferApplicationLog,
  NewOfferBenefit,
  NewOfferRange,
  offerApplicationLogs,
  offerBenefits,
  offerConditions,
  offerRangeExcludedBrands,
  offerRangeExcludedCategories,
  offerRangeExcludedProductClasses,
  offerRangeExcludedProducts,
  offerRangeIncludedBrands,
  offerRangeIncludedCategories,
  offerRangeIncludedProductClasses,
  offerRangeIncludedProducts,
  offerRanges,
  offers,
  offerUsages,
  UpdateOffer,
  UpdateOfferBenefit,
  UpdateOfferRange,
} from '../schemas'
import { membershipPlans, memberships } from '../../membership/schemas'
import { MembershipService } from '../../membership/services/membership'
import { Decimal } from 'decimal.js'

type OfferKind = 'site' | 'user' | 'voucher'

// Whether the user is one the offer is for: everyone, one of its users, or a
// member of one of its plans (an active membership)
const inAudience = (userId: string | null) =>
  or(
    eq(offers.includeAllUsers, true),
    sql`${userId} IN (SELECT jsonb_array_elements_text(${offers.includedUserIds}))`,
    sql`EXISTS (
      SELECT 1 FROM ${memberships}
      WHERE ${memberships.userId} = ${userId}
        AND ${memberships.status} = 'active'
        AND ${memberships.startsAt} <= now()
        AND ${memberships.endsAt} > now()
        AND ${memberships.planId}::text IN (SELECT jsonb_array_elements_text(${offers.includedMembershipPlanIds}))
    )`,
  )

// Whether the outer query's product is in the outer query's range. With
// inclusiveFilter, it must match every list (an `includeAll...` flag matches
// anything); without, any one of them. Either way, a product on any excluded
// list is left out. A category covers its subcategories, at any depth.
const listed = (included: any, column: any, all: any) =>
  sql`(${all} = true OR EXISTS (SELECT 1 FROM ${included} WHERE ${included.rangeId} = ${offerRanges.id} AND ${column}))`
const unlisted = (excluded: any, column: any) =>
  sql`NOT EXISTS (SELECT 1 FROM ${excluded} WHERE ${excluded.rangeId} = ${offerRanges.id} AND ${column})`
const inProducts = listed(offerRangeIncludedProducts, sql`${offerRangeIncludedProducts.productId} = ${products.id}`, offerRanges.includeAllProducts)
const inBrands = listed(offerRangeIncludedBrands, sql`${offerRangeIncludedBrands.brandId} = ${products.brandId}`, offerRanges.includeAllBrands)
// The product's category is one of the range's listed categories (included or
// excluded) or under one. UNION skips categories already found, so a loop of
// parents cannot recurse forever.
const categoryUnder = (list: typeof offerRangeIncludedCategories | typeof offerRangeExcludedCategories) => sql`${products.categoryId} IN (
  WITH RECURSIVE tree(id) AS (
    SELECT l."categoryId" FROM ${list} l WHERE l."rangeId" = ${offerRanges.id}
    UNION
    SELECT child.id FROM ${categories} child JOIN tree ON child."parentId" = tree.id
  )
  SELECT id FROM tree
)`
const inCategories = sql`(${offerRanges.includeAllCategories} = true OR ${categoryUnder(offerRangeIncludedCategories)})`
const inClasses = listed(offerRangeIncludedProductClasses, sql`${offerRangeIncludedProductClasses.productClassId} = ${products.productClassId}`, offerRanges.includeAllProductClasses)
const productInRange = sql`(
  (
    (${offerRanges.inclusiveFilter} = true AND ${inProducts} AND ${inBrands} AND ${inCategories} AND ${inClasses})
    OR (${offerRanges.inclusiveFilter} = false AND (${inProducts} OR ${inBrands} OR ${inCategories} OR ${inClasses}))
  )
  AND ${unlisted(offerRangeExcludedProducts, sql`${offerRangeExcludedProducts.productId} = ${products.id}`)}
  AND ${unlisted(offerRangeExcludedBrands, sql`${offerRangeExcludedBrands.brandId} = ${products.brandId}`)}
  AND NOT COALESCE(${categoryUnder(offerRangeExcludedCategories)}, false)
  AND ${unlisted(offerRangeExcludedProductClasses, sql`${offerRangeExcludedProductClasses.productClassId} = ${products.productClassId}`)}
)`

// A copy of the cart content without any offer applied, to price a set of
// offers on its own
const withoutOffers = (content: CartContent): CartContent => {
  const copy = structuredClone(content)
  for (const part of [copy, ...copy.lines]) {
    part.siteOfferDiscounts = []
    part.userOfferDiscounts = []
    part.voucherOfferDiscounts = []
    part.totalOfferDiscount = 0
  }
  copy.notCombinedVoucherOffers = []
  return copy
}

const sellingPrice = (line: CartContent['lines'][number]) =>
  new Decimal(line.variant.discountedPrice ?? line.variant.price!)

// Whether a free shipping offer is already applied to the cart
const hasFreeShipping = (cartContent: CartContent) =>
  [
    ...cartContent.siteOfferDiscounts,
    ...cartContent.userOfferDiscounts,
    ...cartContent.voucherOfferDiscounts,
  ].some((discount) => discount.benefitType === 'free_shipping')

// Whether every in-range line is already discounted down to zero
const isFullyDiscounted = (cartContent: CartContent, productIdsInOfferRange: number[]) =>
  cartContent.lines
    .filter((line) => productIdsInOfferRange.includes(line.variant.productId))
    .every((line) =>
      new Decimal(`${line.totalOfferDiscount}`).gte(sellingPrice(line).mul(line.quantity)),
    )

// Applies the offer's benefit to the in-range lines that meet its condition and
// records it on the cart. Returns whether it gave anything.
//
// Conditions, over the lines in the offer's range:
// - basket_quantity: a product's quantity, across its variants, reaches the
//   value. Only that product's lines get the benefit.
// - basket_total: the lines' total at selling price (before other offers)
//   reaches the value
// - distinct_items: the number of different products reaches the value
//
// Benefits, per unit (up to maxAffectedItems units per line), never more than
// what is left of the line's selling price:
// - fixed_amount: the value off
// - percentage: the value percent off the selling price
// - fixed_price: the unit sells at the value (no discount if already cheaper)
// - free_shipping: no line discount; priceCart waives the shipping charge
const applyBenefit = (
  offer: any,
  cartContent: CartContent,
  productIdsInOfferRange: number[],
  kind: OfferKind,
) => {
  const inRange = cartContent.lines.filter((line) =>
    productIdsInOfferRange.includes(line.variant.productId),
  )
  const conditionValue = new Decimal(offer.condition.value)
  let qualifying: typeof inRange
  if (offer.condition.type === 'basket_quantity') {
    const quantities = new Map<number, number>()
    for (const line of inRange) {
      const { productId } = line.variant
      quantities.set(productId, (quantities.get(productId) ?? 0) + line.quantity)
    }
    qualifying = inRange.filter((line) =>
      conditionValue.lte(quantities.get(line.variant.productId)!),
    )
  } else if (offer.condition.type === 'basket_total') {
    const total = inRange.reduce(
      (sum, line) => sum.add(sellingPrice(line).mul(line.quantity)),
      new Decimal(0),
    )
    qualifying = total.gte(conditionValue) ? inRange : []
  } else {
    const distinct = new Set(inRange.map((line) => line.variant.productId)).size
    qualifying = conditionValue.lte(distinct) ? inRange : []
  }
  if (!qualifying.length) {
    return false
  }

  const entry = (discount: Decimal) => ({
    id: offer.id,
    name: offer.name,
    discount: discount.toNumber(),
    ...(kind === 'voucher' ? { voucherCode: offer.voucherCode } : {}),
    benefitType: offer.benefit.type,
    benefitValue: offer.benefit.value,
    conditionType: offer.condition.type,
    conditionValue: offer.condition.value,
  })
  const listKey = `${kind}OfferDiscounts` as const

  if (offer.benefit.type === 'free_shipping') {
    cartContent[listKey].push(entry(new Decimal(0)) as any)
    return true
  }

  const value = new Decimal(offer.benefit.value)
  let applied = false
  for (const line of qualifying) {
    const price = sellingPrice(line)
    const perUnit = Decimal.min(
      offer.benefit.type === 'fixed_amount'
        ? value
        : offer.benefit.type === 'percentage'
          ? price.mul(value).div(100)
          : Decimal.max(price.sub(value), 0),
      price,
    )
    const units = offer.benefit.maxAffectedItems
      ? Math.min(line.quantity, offer.benefit.maxAffectedItems)
      : line.quantity
    const currentDiscount = new Decimal(`${line.totalOfferDiscount}`)
    const discount = Decimal.min(
      perUnit.mul(units),
      price.mul(line.quantity).sub(currentDiscount),
    )
    if (discount.lte(0)) {
      continue
    }
    line[listKey].push(entry(discount) as any)
    cartContent[listKey].push(entry(discount) as any)
    line.totalOfferDiscount = currentDiscount.add(discount).toNumber()
    cartContent.totalOfferDiscount = new Decimal(`${cartContent.totalOfferDiscount}`)
      .add(discount)
      .toNumber()
    applied = true
  }
  return applied
}

interface OfferRangeListFilter {
  pagination?: {
    page: number
    size: number
  }
  q?: string
  isActive?: boolean
}

class OfferRangeService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(data: NewOfferRange) {
    return await this.db.transaction(async (tx) => {
      const [offerRange] = await tx
        .insert(offerRanges)
        .values(data)
        .returning()
      if (data.includedProducts && data.includedProducts.length) {
        await tx.insert(offerRangeIncludedProducts).values(
          data.includedProducts.map((productId) => ({
            rangeId: offerRange.id,
            productId,
          })),
        )
      }
      if (data.excludedProducts && data.excludedProducts.length) {
        await tx.insert(offerRangeExcludedProducts).values(
          data.excludedProducts.map((productId) => ({
            rangeId: offerRange.id,
            productId,
          })),
        )
      }
      if (data.includedCategories && data.includedCategories.length) {
        await tx.insert(offerRangeIncludedCategories).values(
          data.includedCategories.map((categoryId) => ({
            rangeId: offerRange.id,
            categoryId,
          })),
        )
      }
      if (data.excludedCategories && data.excludedCategories.length) {
        await tx.insert(offerRangeExcludedCategories).values(
          data.excludedCategories.map((categoryId) => ({
            rangeId: offerRange.id,
            categoryId,
          })),
        )
      }
      if (data.includedBrands && data.includedBrands.length) {
        await tx.insert(offerRangeIncludedBrands).values(
          data.includedBrands.map((brandId) => ({
            rangeId: offerRange.id,
            brandId,
          })),
        )
      }
      if (data.excludedBrands && data.excludedBrands.length) {
        await tx.insert(offerRangeExcludedBrands).values(
          data.excludedBrands.map((brandId) => ({
            rangeId: offerRange.id,
            brandId,
          })),
        )
      }
      if (data.includedProductClasses && data.includedProductClasses.length) {
        await tx.insert(offerRangeIncludedProductClasses).values(
          data.includedProductClasses.map((productClassId) => ({
            rangeId: offerRange.id,
            productClassId,
          })),
        )
      }
      if (data.excludedProductClasses && data.excludedProductClasses.length) {
        await tx.insert(offerRangeExcludedProductClasses).values(
          data.excludedProductClasses.map((productClassId) => ({
            rangeId: offerRange.id,
            productClassId,
          })),
        )
      }
      return offerRange
    })
  }

  async get(id: number) {
    const offer = await this.db.query.offerRanges.findFirst({
      where: eq(offerRanges.id, id),
      with: {
        includedProducts: {
          with: {
            product: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        excludedProducts: {
          with: {
            product: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedCategories: {
          with: {
            category: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedBrands: {
          with: {
            brand: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedProductClasses: {
          with: {
            productClass: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        excludedCategories: {
          with: { category: { columns: { id: true, name: true } } },
        },
        excludedBrands: {
          with: { brand: { columns: { id: true, name: true } } },
        },
        excludedProductClasses: {
          with: { productClass: { columns: { id: true, name: true } } },
        },
      },
    })
    if (!offer) {
      return offer
    }
    return {
      ...offer,
      includedProducts: offer.includedProducts.map((p: any) => p.product),
      excludedProducts: offer.excludedProducts.map((p: any) => p.product),
      includedCategories: offer.includedCategories.map((c: any) => c.category),
      includedBrands: offer.includedBrands.map((b: any) => b.brand),
      includedProductClasses: offer.includedProductClasses.map(
        (pc: any) => pc.productClass,
      ),
      excludedCategories: offer.excludedCategories.map((c: any) => c.category),
      excludedBrands: offer.excludedBrands.map((b: any) => b.brand),
      excludedProductClasses: offer.excludedProductClasses.map(
        (pc: any) => pc.productClass,
      ),
    }
  }

  async update(id: number, data: UpdateOfferRange) {
    return await this.db.transaction(async (tx) => {
      const [offerRange] = await tx
        .update(offerRanges)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(offerRanges.id, id))
        .returning()
      if (!offerRange) {
        throw new NotFoundError(`Offer range not found: ${id}`)
      }
      if (data.includedProducts) {
        await tx
          .delete(offerRangeIncludedProducts)
          .where(eq(offerRangeIncludedProducts.rangeId, id))
        if (data.includedProducts.length > 0) {
          await tx.insert(offerRangeIncludedProducts).values(
            data.includedProducts.map((productId) => ({
              rangeId: id,
              productId,
            })),
          )
        }
      }
      if (data.excludedProducts) {
        await tx
          .delete(offerRangeExcludedProducts)
          .where(eq(offerRangeExcludedProducts.rangeId, id))
        if (data.excludedProducts.length > 0) {
          await tx.insert(offerRangeExcludedProducts).values(
            data.excludedProducts.map((productId) => ({
              rangeId: id,
              productId,
            })),
          )
        }
      }
      if (data.includedCategories) {
        await tx
          .delete(offerRangeIncludedCategories)
          .where(eq(offerRangeIncludedCategories.rangeId, id))
        if (data.includedCategories.length > 0) {
          await tx.insert(offerRangeIncludedCategories).values(
            data.includedCategories.map((categoryId) => ({
              rangeId: id,
              categoryId,
            })),
          )
        }
      }
      if (data.excludedCategories) {
        await tx
          .delete(offerRangeExcludedCategories)
          .where(eq(offerRangeExcludedCategories.rangeId, id))
        if (data.excludedCategories.length > 0) {
          await tx.insert(offerRangeExcludedCategories).values(
            data.excludedCategories.map((categoryId) => ({
              rangeId: id,
              categoryId,
            })),
          )
        }
      }
      if (data.includedBrands) {
        await tx
          .delete(offerRangeIncludedBrands)
          .where(eq(offerRangeIncludedBrands.rangeId, id))
        if (data.includedBrands.length > 0) {
          await tx.insert(offerRangeIncludedBrands).values(
            data.includedBrands.map((brandId) => ({
              rangeId: id,
              brandId,
            })),
          )
        }
      }
      if (data.excludedBrands) {
        await tx
          .delete(offerRangeExcludedBrands)
          .where(eq(offerRangeExcludedBrands.rangeId, id))
        if (data.excludedBrands.length > 0) {
          await tx.insert(offerRangeExcludedBrands).values(
            data.excludedBrands.map((brandId) => ({
              rangeId: id,
              brandId,
            })),
          )
        }
      }
      if (data.includedProductClasses) {
        await tx
          .delete(offerRangeIncludedProductClasses)
          .where(eq(offerRangeIncludedProductClasses.rangeId, id))
        if (data.includedProductClasses.length > 0) {
          await tx.insert(offerRangeIncludedProductClasses).values(
            data.includedProductClasses.map((productClassId) => ({
              rangeId: id,
              productClassId,
            })),
          )
        }
      }
      if (data.excludedProductClasses) {
        await tx
          .delete(offerRangeExcludedProductClasses)
          .where(eq(offerRangeExcludedProductClasses.rangeId, id))
        if (data.excludedProductClasses.length > 0) {
          await tx.insert(offerRangeExcludedProductClasses).values(
            data.excludedProductClasses.map((productClassId) => ({
              rangeId: id,
              productClassId,
            })),
          )
        }
      }
      return offerRange
    })
  }

  async delete(id: number) {
    const [offerRange] = await this.db
      .delete(offerRanges)
      .where(eq(offerRanges.id, id))
      .returning()
    if (!offerRange) {
      throw new NotFoundError(`Offer range not found: ${id}`)
    }
    return offerRange
  }

  async list<F extends OfferRangeListFilter = {}>(filters: Exact<F, OfferRangeListFilter>) {
    const where: SQL[] = []

    if (filters.q) {
      where.push(ilike(offerRanges.name, `%${filters.q}%`))
    }

    if (filters.isActive !== undefined) {
      where.push(eq(offerRanges.isActive, filters.isActive))
    }

    const query = this.db
      .select()
      .from(offerRanges)
      .where(and(...where))
      .orderBy(desc(offerRanges.createdAt))
    return await paginate(
      filters as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(offerRanges, and(...where)),
    )
  }
}

interface OfferBenefitListFilter {
  pagination?: {
    page: number
    size: number
  }
  q?: string
  isActive?: boolean
  type?: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
}

class OfferBenefitService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(data: NewOfferBenefit) {
    const [offerBenefit] = await this.db
      .insert(offerBenefits)
      .values(data)
      .returning()
    return offerBenefit
  }

  async get(id: number) {
    return await this.db.query.offerBenefits.findFirst({
      where: eq(offerBenefits.id, id),
    })
  }

  async update(id: number, data: UpdateOfferBenefit) {
    const [offerBenefit] = await this.db
      .update(offerBenefits)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(offerBenefits.id, id))
      .returning()
    if (!offerBenefit) {
      throw new NotFoundError(`Offer benefit not found: ${id}`)
    }
    return offerBenefit
  }

  async delete(id: number) {
    const [offerBenefit] = await this.db
      .delete(offerBenefits)
      .where(eq(offerBenefits.id, id))
      .returning()
    if (!offerBenefit) {
      throw new NotFoundError(`Offer benefit not found: ${id}`)
    }
    return offerBenefit
  }

  async list<F extends OfferBenefitListFilter = {}>(filters: Exact<F, OfferBenefitListFilter>) {
    const where: SQL[] = []

    if (filters.q) {
      where.push(ilike(offerBenefits.name, `%${filters.q}%`))
    }

    if (filters.isActive !== undefined) {
      where.push(eq(offerBenefits.isActive, filters.isActive))
    }

    if (filters.type) {
      where.push(eq(offerBenefits.type, filters.type))
    }

    const query = this.db
      .select()
      .from(offerBenefits)
      .where(and(...where))
      .orderBy(desc(offerBenefits.createdAt))
    return await paginate(
      filters as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(offerBenefits, and(...where)),
    )
  }
}

type OfferConditionType = 'basket_quantity' | 'basket_total' | 'distinct_items'

interface OfferConditionListFilter {
  pagination?: {
    page: number
    size: number
  }
  type?: OfferConditionType
  range?: number
}

class OfferConditionService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(data: { rangeId: number; type: OfferConditionType; value: string }) {
    const [offerCondition] = await this.db
      .insert(offerConditions)
      .values(data)
      .returning()
    return offerCondition
  }

  async get(id: number) {
    return await this.db.query.offerConditions.findFirst({
      where: eq(offerConditions.id, id),
    })
  }

  async update(id: number, data: { type?: OfferConditionType; value?: string }) {
    const [offerCondition] = await this.db
      .update(offerConditions)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerConditions.id, id))
      .returning()
    if (!offerCondition) {
      throw new NotFoundError(`Offer condition not found: ${id}`)
    }
    return offerCondition
  }

  async delete(id: number) {
    const [offerCondition] = await this.db
      .delete(offerConditions)
      .where(eq(offerConditions.id, id))
      .returning()
    if (!offerCondition) {
      throw new NotFoundError(`Offer condition not found: ${id}`)
    }
    return offerCondition
  }

  async list<F extends OfferConditionListFilter = {}>(filters: Exact<F, OfferConditionListFilter>) {
    const where: SQL[] = []

    if (filters.type) {
      where.push(eq(offerConditions.type, filters.type))
    }

    if (filters.range) {
      where.push(eq(offerConditions.rangeId, filters.range))
    }

    const query = this.db
      .select()
      .from(offerConditions)
      .where(and(...where))
      .orderBy(desc(offerConditions.createdAt))
    return await paginate(
      filters as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(offerConditions, and(...where)),
    )
  }
}

interface OfferListFilter {
  pagination?: {
    page: number
    size: number
  }
  q?: string
  type?: 'site' | 'voucher' | 'user'
  condition?: number
  benefit?: number
  isActive?: boolean
  isFeatured?: boolean
  // By dates, whether active or not: running (started, not ended),
  // scheduled (starts later) or ended
  state?: 'running' | 'scheduled' | 'ended'
}

interface ActiveUserOfferListFilter {
  // Site offers are for every buyer, so their user targeting is ignored
  type?: 'site' | 'voucher' | 'user'
  isFeatured?: boolean
}

// Every voucher has a code, the one buyers enter; other offers apply on their
// own and have none
const checkVoucherCode = (offer: { type?: string; voucherCode?: string | null }) => {
  if (offer.type === 'voucher' && !offer.voucherCode) {
    throw new ValidationError('A voucher needs a voucher code')
  }
  if (offer.type !== 'voucher' && offer.voucherCode) {
    throw new ValidationError('Only vouchers have a voucher code')
  }
}

// Which products an offer covers, as the offer form edits them: every
// product, or those in any of the lists; minus the exceptions either way
type OfferProductLists = { products?: number[]; categories?: number[]; brands?: number[]; productClasses?: number[] }
type OfferProducts = OfferProductLists & { all: boolean; except?: OfferProductLists }
type OfferParts = {
  products: OfferProducts
  condition: { type: 'basket_quantity' | 'basket_total' | 'distinct_items'; value: string }
  benefit: { type: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'; value: string; maxAffectedItems?: number | null }
}
type NewOfferWithParts = Omit<NewOffer, 'conditionId' | 'benefitId'> & OfferParts
type UpdateOfferWithParts = Partial<Omit<NewOffer, 'conditionId' | 'benefitId'>> & Partial<OfferParts>

// The range fields for these products
const rangeFor = (name: string, products: OfferProducts): NewOfferRange => ({
  name,
  inclusiveFilter: products.all,
  includeAllProducts: products.all,
  includeAllBrands: products.all,
  includeAllCategories: products.all,
  includeAllProductClasses: products.all,
  includedProducts: products.all ? [] : (products.products ?? []),
  includedCategories: products.all ? [] : (products.categories ?? []),
  includedBrands: products.all ? [] : (products.brands ?? []),
  includedProductClasses: products.all ? [] : (products.productClasses ?? []),
  excludedProducts: products.except?.products ?? [],
  excludedCategories: products.except?.categories ?? [],
  excludedBrands: products.except?.brands ?? [],
  excludedProductClasses: products.except?.productClasses ?? [],
})

class OfferService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  // An offer with its range, condition and benefit, made together: what the
  // backoffice's offer form saves. Each part is named after the offer.
  async createWithParts({ products, condition, benefit, ...offer }: NewOfferWithParts) {
    checkVoucherCode(offer)
    return await this.db.transaction(async (tx) => {
      const range = await new OfferRangeService(tx).create(rangeFor(offer.name, products))
      const [newCondition] = await tx.insert(offerConditions).values({ ...condition, rangeId: range.id }).returning()
      const [newBenefit] = await tx.insert(offerBenefits).values({ ...benefit, name: offer.name }).returning()
      const [created] = await tx
        .insert(offers)
        .values({ ...offer, conditionId: newCondition.id, benefitId: newBenefit.id })
        .returning()
      return created
    })
  }

  // The offer with its condition, benefit and products. `products` is null
  // when its range is one the form cannot show (made through the range
  // routes, such as one that must match every list): update it there.
  async getWithParts(id: number) {
    const offer = await this.get(id)
    if (!offer) {
      return null
    }
    const range = (await new OfferRangeService(this.db).get(offer.condition.rangeId))!
    const everything =
      range.inclusiveFilter &&
      range.includeAllProducts &&
      range.includeAllBrands &&
      range.includeAllCategories &&
      range.includeAllProductClasses
    const chosen =
      !range.inclusiveFilter &&
      !range.includeAllProducts &&
      !range.includeAllBrands &&
      !range.includeAllCategories &&
      !range.includeAllProductClasses
    const named = (rows: { id: number; name: string }[]) => rows.map(({ id, name }) => ({ id, name }))
    return {
      ...offer,
      products:
        everything || chosen
          ? {
              all: Boolean(everything),
              products: named(range.includedProducts),
              categories: named(range.includedCategories),
              brands: named(range.includedBrands),
              productClasses: named(range.includedProductClasses),
              except: {
                products: named(range.excludedProducts),
                categories: named(range.excludedCategories),
                brands: named(range.excludedBrands),
                productClasses: named(range.excludedProductClasses),
              },
            }
          : null,
    }
  }

  // Changes the offer and the parts given. A part another offer also uses
  // (made through the part routes) is copied first, so that offer keeps it.
  async updateWithParts(id: number, { products, condition, benefit, ...data }: UpdateOfferWithParts) {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(offers).where(eq(offers.id, id)).for('update')
      if (!existing) {
        throw new NotFoundError(`Offer not found: ${id}`)
      }
      checkVoucherCode({ ...existing, ...data })
      const name = data.name ?? existing.name
      const [currentCondition] = await tx.select().from(offerConditions).where(eq(offerConditions.id, existing.conditionId))
      const shared = async (column: typeof offers.conditionId | typeof offers.benefitId, value: number) =>
        (await tx.$count(offers, and(eq(column, value), ne(offers.id, id)))) > 0

      let conditionId = existing.conditionId
      if (products || condition) {
        let rangeId = currentCondition.rangeId
        if (products) {
          const rangeShared =
            (await tx.$count(offerConditions, and(eq(offerConditions.rangeId, rangeId), ne(offerConditions.id, conditionId)))) > 0 ||
            (await shared(offers.conditionId, conditionId))
          if (rangeShared) {
            rangeId = (await new OfferRangeService(tx).create(rangeFor(name, products))).id
          } else {
            await new OfferRangeService(tx).update(rangeId, rangeFor(name, products))
          }
        }
        const values = { rangeId, type: condition?.type ?? currentCondition.type, value: condition?.value ?? currentCondition.value }
        if (await shared(offers.conditionId, conditionId)) {
          conditionId = (await tx.insert(offerConditions).values(values).returning())[0].id
        } else {
          await tx.update(offerConditions).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(offerConditions.id, conditionId))
        }
      }

      let benefitId = existing.benefitId
      if (benefit) {
        if (await shared(offers.benefitId, benefitId)) {
          benefitId = (await tx.insert(offerBenefits).values({ ...benefit, name }).returning())[0].id
        } else {
          await tx
            .update(offerBenefits)
            .set({ ...benefit, name, updatedAt: new Date().toISOString() })
            .where(eq(offerBenefits.id, benefitId))
        }
      }

      const [offer] = await tx
        .update(offers)
        .set({ ...data, conditionId, benefitId, updatedAt: new Date().toISOString() })
        .where(eq(offers.id, id))
        .returning()
      return offer
    })
  }

  // Deletes the offer, and its parts that no other offer uses
  async deleteWithParts(id: number) {
    return await this.db.transaction(async (tx) => {
      const [offer] = await tx.delete(offers).where(eq(offers.id, id)).returning()
      if (!offer) {
        throw new NotFoundError(`Offer not found: ${id}`)
      }
      if (!(await tx.$count(offers, eq(offers.benefitId, offer.benefitId)))) {
        await tx.delete(offerBenefits).where(eq(offerBenefits.id, offer.benefitId))
      }
      if (!(await tx.$count(offers, eq(offers.conditionId, offer.conditionId)))) {
        const [condition] = await tx.delete(offerConditions).where(eq(offerConditions.id, offer.conditionId)).returning()
        if (!(await tx.$count(offerConditions, eq(offerConditions.rangeId, condition.rangeId)))) {
          await tx.delete(offerRanges).where(eq(offerRanges.id, condition.rangeId))
        }
      }
      return offer
    })
  }

  async create(data: NewOffer) {
    checkVoucherCode(data)
    const [offer] = await this.db.insert(offers).values(data).returning()
    return offer
  }

  // The offer with its condition and benefit
  async get(id: number) {
    return await this.db.query.offers.findFirst({
      where: eq(offers.id, id),
      with: {
        condition: true,
        benefit: true,
      },
    })
  }

  async getByVoucherCode(voucherCode: string) {
    return await this.db.query.offers.findFirst({
      where: and(
        eq(offers.voucherCode, voucherCode),
        eq(offers.type, 'voucher'),
      ),
      with: {
        condition: true,
        benefit: true,
      },
    })
  }

  async update(id: number, data: UpdateOffer) {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(offers).where(eq(offers.id, id)).for('update')
      if (!existing) {
        throw new NotFoundError(`Offer not found: ${id}`)
      }
      // Checked as the offer will be after the change
      checkVoucherCode({ ...existing, ...data })
      const [offer] = await tx
        .update(offers)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(offers.id, id))
        .returning()
      return offer
    })
  }

  async delete(id: number) {
    const [offer] = await this.db.delete(offers).where(eq(offers.id, id)).returning()
    if (!offer) {
      throw new NotFoundError(`Offer not found: ${id}`)
    }
    return offer
  }

  async list<F extends OfferListFilter = {}>(filters: Exact<F, OfferListFilter>) {
    const where: SQL[] = []

    if (filters.q) {
      where.push(ilike(offers.name, `%${filters.q}%`))
    }

    if (filters.isActive !== undefined) {
      where.push(eq(offers.isActive, filters.isActive))
    }

    if (filters.isFeatured !== undefined) {
      where.push(eq(offers.isFeatured, filters.isFeatured))
    }

    if (filters.type) {
      where.push(eq(offers.type, filters.type))
    }

    if (filters.condition) {
      where.push(eq(offers.conditionId, filters.condition))
    }

    if (filters.benefit) {
      where.push(eq(offers.benefitId, filters.benefit))
    }

    if (filters.state) {
      const now = new Date().toISOString()
      if (filters.state === 'scheduled') {
        where.push(gt(offers.startDate, now))
      } else if (filters.state === 'ended') {
        where.push(lt(offers.endDate, now))
      } else {
        where.push(
          and(or(isNull(offers.startDate), lte(offers.startDate, now)), or(isNull(offers.endDate), gte(offers.endDate, now)))!,
        )
      }
    }

    // Each with its benefit and condition, for lists
    const query = this.db
      .select({
        ...getTableColumns(offers),
        benefit: { type: offerBenefits.type, value: offerBenefits.value },
        condition: { type: offerConditions.type, value: offerConditions.value },
      })
      .from(offers)
      .innerJoin(offerBenefits, eq(offerBenefits.id, offers.benefitId))
      .innerJoin(offerConditions, eq(offerConditions.id, offers.conditionId))
      .where(and(...where))
      .orderBy(desc(offers.createdAt))
      .$dynamic()
    return await paginate(
      filters as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(offers, and(...where)),
    )
  }

  // The featured offers anyone can use now, to show in the store: active,
  // running, not used up, and either automatic (site) or a voucher open to
  // every customer (not to chosen ones or to members). Highest priority
  // first, then newest; each with its benefit and condition.
  async featuredForEveryone() {
    const now = new Date().toISOString()
    return await this.db
      .select({
        ...getTableColumns(offers),
        benefit: { type: offerBenefits.type, value: offerBenefits.value },
        condition: { type: offerConditions.type, value: offerConditions.value },
      })
      .from(offers)
      .innerJoin(offerBenefits, eq(offerBenefits.id, offers.benefitId))
      .innerJoin(offerConditions, eq(offerConditions.id, offers.conditionId))
      .where(
        and(
          eq(offers.isActive, true),
          eq(offers.isFeatured, true),
          or(isNull(offers.startDate), lte(offers.startDate, now)),
          or(isNull(offers.endDate), gte(offers.endDate, now)),
          or(isNull(offers.overallLimit), lt(offers.usageCount, offers.overallLimit)),
          or(
            eq(offers.type, 'site'),
            and(eq(offers.type, 'voucher'), eq(offers.includeAllUsers, true), sql`${offers.includedMembershipPlanIds} = '[]'::jsonb`),
          ),
        ),
      )
      .orderBy(desc(offers.priority), desc(offers.createdAt))
  }

  async markAsActive(id: number) {
    const [offer] = await this.db
      .update(offers)
      .set({ isActive: true })
      .where(eq(offers.id, id))
      .returning()
    return offer
  }

  async markAsInactive(id: number) {
    const [offer] = await this.db
      .update(offers)
      .set({ isActive: false })
      .where(eq(offers.id, id))
      .returning()
    return offer
  }

  async getActiveUserOffers(
    userId: string | null,
    filters?: ActiveUserOfferListFilter,
  ) {
    const now = new Date().toISOString()

    const where = []

    where.push(eq(offers.type, filters?.type || 'user'))

    if (filters?.isFeatured !== undefined) {
      where.push(eq(offers.isFeatured, filters.isFeatured))
    }

    return await this.db
    .select({
      id: offers.id,
      name: offers.name,
      description: offers.description,
      voucherCode: offers.voucherCode,
      image: offers.image,
      startDate: offers.startDate,
      endDate: offers.endDate,
      isActive: offers.isActive,
      isFeatured: offers.isFeatured,
      type: offers.type,
      metadata: offers.metadata,
      combinesWithOtherOffers: offers.combinesWithOtherOffers,
      benefit: {
        isActive: offerBenefits.isActive,
        type: offerBenefits.type,
        value: offerBenefits.value,
        maxAffectedItems: offerBenefits.maxAffectedItems,
      },
      condition: {
        rangeId: offerConditions.rangeId,
        type: offerConditions.type,
        value: offerConditions.value,
      },
      productIds: sql<number[]>`
      ARRAY(
        SELECT DISTINCT ${products.id}
        FROM ${products}
        LEFT JOIN ${offerRangeIncludedProducts} ON ${products.id} = ${offerRangeIncludedProducts.productId}
        LEFT JOIN ${offerRangeIncludedBrands} ON ${products.brandId} = ${offerRangeIncludedBrands.brandId} AND ${offerRangeIncludedBrands.rangeId} = ${offerConditions.rangeId}
        LEFT JOIN ${offerRangeIncludedCategories} ON 
          ${products.categoryId} = ${offerRangeIncludedCategories.categoryId}
          AND ${offerRangeIncludedCategories.rangeId} = ${offerConditions.rangeId}
        WHERE ${offerRangeIncludedProducts.rangeId} = ${offerConditions.rangeId}
          AND (
            ${offerRanges.includeAllBrands} OR ${offerRangeIncludedBrands.brandId} IS NOT NULL
          )
          AND (
            ${offerRanges.includeAllCategories} OR ${offerRangeIncludedCategories.categoryId} IS NOT NULL
          )
      )
    `,
    })
    .from(offers)
    .where(
      and(
        ...where,
        eq(offers.isActive, true),
        filters?.type === 'site' ? undefined : inAudience(userId),
        or(isNull(offers.startDate), lte(offers.startDate, now)),
        or(isNull(offers.endDate), gte(offers.endDate, now)),
        or(isNull(offers.overallLimit), lt(offers.usageCount, offers.overallLimit)),
        or(
          isNull(offers.limitPerUser),
          lt(
            sql`COALESCE((
            SELECT ${offerUsages.usageCount}
            FROM ${offerUsages}
            WHERE ${offerUsages.offerId} = ${offers.id}
              AND ${offerUsages.userId} = ${userId}
          ), 0)`,
            offers.limitPerUser,
          ),
        ),
      ),
    )
    .leftJoin(offerBenefits, eq(offers.benefitId, offerBenefits.id))
    .leftJoin(offerConditions, eq(offers.conditionId, offerConditions.id))
    .leftJoin(offerRanges, eq(offerConditions.rangeId, offerRanges.id))
    .groupBy(
      offers.id,
      offerBenefits.id,
      offerConditions.id,
      offerRanges.includeAllBrands,
      offerRanges.includeAllCategories,
    )
    .orderBy(desc(offers.priority), desc(offers.createdAt))
  }

  async getActiveApplicableUserOffers(userId: string, productIds: number[]){
    const now = new Date().toISOString()

    const userUsage = this.db
      .select({
        offerId: offerUsages.offerId,
        usageCount: offerUsages.usageCount,
      })
      .from(offerUsages)
      .where(eq(offerUsages.userId, userId))
      .as('user_usage');

    return await this.db
      .select({
        id: offers.id,
        name: offers.name,
        description: offers.description,
        voucherCode: offers.voucherCode,
        image: offers.image,
        startDate: offers.startDate,
        endDate: offers.endDate,
        isActive: offers.isActive,
        isFeatured: offers.isFeatured,
        type: offers.type,
        metadata: offers.metadata,
        benefit: {
          isActive: offerBenefits.isActive,
          type: offerBenefits.type,
          value: offerBenefits.value,
        },
        condition: {
          rangeId: offerConditions.rangeId,
          type: offerConditions.type,
          value: offerConditions.value,
        },
      })
      .from(offers)
      .leftJoin(offerConditions, eq(offers.conditionId, offerConditions.id))
      .leftJoin(offerBenefits, eq(offers.benefitId, offerBenefits.id))
      .leftJoin(userUsage, eq(userUsage.offerId, offers.id))
      .where(
        and(
          eq(offers.type, 'user'),
          eq(offers.isActive, true),
          inAudience(userId),
          or(isNull(offers.startDate), lte(offers.startDate, now)),
          or(isNull(offers.endDate), gte(offers.endDate, now)),
          or(
            isNull(offers.overallLimit),
            lt(offers.usageCount, offers.overallLimit),
          ),
          or(
            isNull(offers.limitPerUser),
            sql`COALESCE(${userUsage.usageCount}, 0) < ${offers.limitPerUser}`,
          ),
          sql`
            EXISTS (
              SELECT 1 FROM ${products}
              LEFT JOIN ${brands} ON ${products.brandId} = ${brands.id}
              LEFT JOIN ${categories} ON ${products.categoryId} = ${categories.id}
              LEFT JOIN ${productClasses} ON ${products.productClassId} = ${productClasses.id}
              WHERE ${inArray(products.id, productIds)}
              AND EXISTS (
                SELECT 1 FROM ${offerRanges}
                WHERE ${offerRanges.id} = ${offerConditions.rangeId}
                AND ${offerRanges.isActive} = true
                AND ${productInRange}
              )
            )
          `
        )
      )
      .orderBy(desc(offers.priority), desc(offers.createdAt));
  }

  async getActiveApplicableVoucherOffers(userId: string, productIds: number[]) {
    const now = new Date().toISOString();

    const userUsage = this.db
      .select({
        offerId: offerUsages.offerId,
        usageCount: offerUsages.usageCount,
      })
      .from(offerUsages)
      .where(eq(offerUsages.userId, userId))
      .as('user_usage');

    return await this.db
      .select({
        id: offers.id,
        name: offers.name,
        description: offers.description,
        voucherCode: offers.voucherCode,
        image: offers.image,
        startDate: offers.startDate,
        endDate: offers.endDate,
        isActive: offers.isActive,
        isFeatured: offers.isFeatured,
        type: offers.type,
        metadata: offers.metadata,
        condition: {
          type: offerConditions.type,
          value: offerConditions.value,
        },
        benefit: {
          isActive: offerBenefits.isActive,
          type: offerBenefits.type,
          value: offerBenefits.value,
        },
      })
      .from(offers)
      .leftJoin(offerConditions, eq(offers.conditionId, offerConditions.id))
      .leftJoin(offerBenefits, eq(offers.benefitId, offerBenefits.id))
      .leftJoin(userUsage, eq(userUsage.offerId, offers.id))
      .where(
        and(
          eq(offers.type, 'voucher'),
          eq(offers.isActive, true),
          or(
            eq(offers.includeAllUsers, true),
            sql`${userId} IN (SELECT jsonb_array_elements_text(${offers.includedUserIds}))`,
          ),
          or(isNull(offers.startDate), lte(offers.startDate, now)),
          or(isNull(offers.endDate), gte(offers.endDate, now)),
          or(isNull(offers.overallLimit), lt(offers.usageCount, offers.overallLimit)),
          or(
            isNull(offers.limitPerUser),
            sql`COALESCE(${userUsage.usageCount}, 0) < ${offers.limitPerUser}`,
          ),
          sql`
            EXISTS (
              SELECT 1 FROM ${products}
              LEFT JOIN ${brands} ON ${products.brandId} = ${brands.id}
              LEFT JOIN ${categories} ON ${products.categoryId} = ${categories.id}
              LEFT JOIN ${productClasses} ON ${products.productClassId} = ${productClasses.id}
              WHERE ${inArray(products.id, productIds)}
              AND EXISTS (
                SELECT 1 FROM ${offerRanges}
                WHERE ${offerRanges.id} = ${offerConditions.rangeId}
                AND ${offerRanges.isActive} = true
                AND ${productInRange}
              )
            )
          `
        )
      )
      .orderBy(desc(offers.priority), desc(offers.createdAt));
}


  async getActiveUserOfferDetails(userId: string, offerId: number) {
    const now = new Date().toISOString()

    const [offer] = await this.db
      .select({
        id: offers.id,
        name: offers.name,
        description: offers.description,
        image: offers.image,
        startDate: offers.startDate,
        endDate: offers.endDate,
        isActive: offers.isActive,
        isFeatured: offers.isFeatured,
        type: offers.type,
        metadata: offers.metadata,
        benefit: {
          type: offerBenefits.type,
          value: offerBenefits.value,
        },
        condition: {
          type: offerConditions.type,
          value: offerConditions.value,
        },
        includedCategories: sql`coalesce(jsonb_agg(jsonb_build_object('id', ${categories.id}, 'name', ${categories.name})), '[]'::jsonb)`,
        includedBrands: sql`coalesce(jsonb_agg(jsonb_build_object('id', ${brands.id}, 'name', ${brands.name})), '[]'::jsonb)`,
      })
      .from(offers)
      .where(
        and(
          eq(offers.id, offerId),
          eq(offers.isActive, true),
          or(
            eq(offers.includeAllUsers, true),
            sql`${userId} IN (SELECT jsonb_array_elements_text(${
              offers.includedUserIds
            }))`,
          ),
          or(isNull(offers.startDate), lte(offers.startDate, now)),
          or(isNull(offers.endDate), gte(offers.endDate, now)),
          or(
            isNull(offers.overallLimit),
            lt(offers.usageCount, offers.overallLimit),
          ),
        ),
      )
      .leftJoin(offerBenefits, eq(offers.benefitId, offerBenefits.id))
      .leftJoin(offerConditions, eq(offers.conditionId, offerConditions.id))
      .leftJoin(
        offerRangeIncludedCategories,
        eq(offerConditions.rangeId, offerRangeIncludedCategories.rangeId),
      )
      .leftJoin(
        categories,
        eq(offerRangeIncludedCategories.categoryId, categories.id),
      )
      .leftJoin(
        offerRangeIncludedBrands,
        eq(offerConditions.rangeId, offerRangeIncludedBrands.rangeId),
      )
      .leftJoin(brands, eq(offerRangeIncludedBrands.brandId, brands.id))
      .groupBy(offers.id, offerBenefits.id, offerConditions.id)
      .orderBy(desc(offers.createdAt))

    return offer
  }

  async getIncludedProducts(offerId: number, q?: string) {
    return await this.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        thumbnail: products.thumbnail,
        minPrice: minVariantPrice,
        isFeatured: products.isFeatured,
      })
      .from(products)
      .where(
        and(
          q ? ilike(products.name, `%${q}%`) : undefined,
          sql`
          EXISTS (
            SELECT 1 FROM ${offers}
            LEFT JOIN ${offerConditions} ON ${offers.conditionId} = ${offerConditions.id}
            LEFT JOIN ${offerRangeIncludedProducts} ON ${offerConditions.rangeId} = ${offerRangeIncludedProducts.rangeId}
            WHERE ${offers.id} = ${offerId}
            AND ${products.id} = ${offerRangeIncludedProducts.productId}
          )
        `,
        ),
      )
  }

  async getProductIdsInOfferRange(rangeId: number, productIds: number[]) {
    const productsInOfferRange = await this.db
      .select({
        id: products.id,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .where(
        and(
          inArray(products.id, productIds),
          sql`
          EXISTS (
              SELECT 1 FROM ${offerRanges}
              WHERE 
              ${offerRanges.id} = ${rangeId}
              AND
              ${offerRanges.isActive} = true
              AND ${productInRange}
          )
          `,
        ),
      )

    return productsInOfferRange.map((p) => p.id)
  }

  async applyVoucherCode(
    cartContent: CartContent,
    voucherOffer?: any,
    voucherCode?: string,
    userId?: string,
  ): Promise<CartContent> {
    if (!voucherOffer) {
      voucherOffer = await this.getByVoucherCode(voucherCode!)
    }
    // Members of the voucher's plans can use it too
    const memberOfPlan = async () =>
      Boolean(
        userId &&
          voucherOffer.includedMembershipPlanIds?.length &&
          (await new MembershipService(this.db).activeMemberships(userId)).some((membership) =>
            voucherOffer.includedMembershipPlanIds.includes(membership.planId),
          ),
      )
    if (
      !voucherOffer ||
      voucherOffer.type !== 'voucher' ||
      !voucherOffer.isActive ||
      (voucherOffer.includeAllUsers === false &&
        !voucherOffer.includedUserIds.includes(userId) &&
        !(await memberOfPlan())) ||
      (voucherOffer.startDate &&
        new Date(voucherOffer.startDate) > new Date()) ||
      (voucherOffer.endDate && new Date(voucherOffer.endDate) < new Date())
    ) {
      throw new ValidationError('Invalid voucher code')
    }

    if (
      voucherOffer.overallLimit &&
      voucherOffer.usageCount &&
      voucherOffer.usageCount >= voucherOffer.overallLimit
    ) {
      throw new ValidationError('Voucher code usage limit exceeded')
    }

    if (voucherOffer.limitPerUser) {
      if (!userId) {
        throw new ValidationError('User id is required to validate voucher code')
      }
      const userUsageCount = await this.db.query.offerUsages.findFirst({
        where: and(
          eq(offerUsages.offerId, voucherOffer.id),
          eq(offerUsages.userId, userId),
        ),
      })
      if (
        userUsageCount && userUsageCount.usageCount &&
        userUsageCount.usageCount >= voucherOffer.limitPerUser
      ) {
        throw new ValidationError('Voucher code usage limit exceeded')
      }
    }

    if (
      await this.db.query.cartAppliedVoucherOffers.findFirst({
        where: and(
          eq(cartAppliedVoucherOffers.offerId, voucherOffer.id),
          eq(cartAppliedVoucherOffers.cartId, cartContent.id),
        ),
      })
    ) {
      throw new ValidationError('Voucher code already used in this cart')
    }

    if (!voucherOffer.benefit.isActive) {
      return cartContent
    }
    // One that does not combine is priced alone; reading the cart then keeps
    // whichever gives more (see CartService.getCartContentForSession)
    if (voucherOffer.combinesWithOtherOffers === false) {
      cartContent = withoutOffers(cartContent)
    }

    const productIds = cartContent.lines.map((line) => line.variant.productId)

    const productIdsInOfferRange = await this.getProductIdsInOfferRange(
      voucherOffer.condition.rangeId,
      productIds,
    )

    if (productIdsInOfferRange.length === 0) {
      throw new ValidationError(
        'Voucher code is not applicable to any product in the cart',
      )
    }

    if (voucherOffer.benefit.type === 'free_shipping') {
      if (hasFreeShipping(cartContent)) {
        throw new ValidationError('Free shipping already applied')
      }
    } else if (isFullyDiscounted(cartContent, productIdsInOfferRange)) {
      throw new ValidationError('Discount already applied to all applicable products')
    }

    if (!applyBenefit(voucherOffer, cartContent, productIdsInOfferRange, 'voucher')) {
      throw new ValidationError(
        'Voucher code is not applicable to any product in the cart',
      )
    }
    await this.db.insert(cartAppliedVoucherOffers).values({
      cartId: cartContent.id,
      offerId: voucherOffer.id,
    })
    return cartContent
  }

  // Applies a user or site offer, if the cart meets its condition
  async applyUserOffer(
    offer: any,
    cartContent: CartContent,
    kind: 'site' | 'user' = 'user',
  ): Promise<CartContent> {
    if (!offer.benefit.isActive) {
      return cartContent
    }

    const productIds = cartContent.lines.map((line) => line.variant.productId)
    const productIdsInOfferRange = await this.getProductIdsInOfferRange(
      offer.condition.rangeId,
      productIds,
    )

    if (
      offer.benefit.type === 'free_shipping'
        ? hasFreeShipping(cartContent)
        : isFullyDiscounted(cartContent, productIdsInOfferRange)
    ) {
      return cartContent
    }

    applyBenefit(offer, cartContent, productIdsInOfferRange, kind)
    return cartContent
  }

  // What one unit of each variant costs a member, for product pages: the
  // lowest price over the plans (or just these plans), from the offers that
  // name the plan and that one unit qualifies for, with the same combining
  // rule as the cart. Offers for everyone, site offers, vouchers, free
  // shipping and per-user limits are left out. Only variants a member pays
  // less for are in the map.
  async memberPrices(
    variants: { id: number; productId: number; price: string | null; discountedPrice: string | null }[],
    planIds?: number[],
  ) {
    const prices = new Map<number, { planId: number; planName: string; price: string }>()
    const now = new Date().toISOString()
    const plans = await this.db.query.membershipPlans.findMany({
      where: and(
        eq(membershipPlans.isActive, true),
        planIds ? inArray(membershipPlans.id, planIds.length ? planIds : [-1]) : undefined,
      ),
    })
    const memberOffers = plans.length
      ? (
          await this.db.query.offers.findMany({
            where: and(
              eq(offers.type, 'user'),
              eq(offers.isActive, true),
              sql`jsonb_array_length(${offers.includedMembershipPlanIds}) > 0`,
              or(isNull(offers.startDate), lte(offers.startDate, now)),
              or(isNull(offers.endDate), gte(offers.endDate, now)),
              or(isNull(offers.overallLimit), lt(offers.usageCount, offers.overallLimit)),
            ),
            with: { condition: true, benefit: true },
            orderBy: [desc(offers.priority), desc(offers.createdAt)],
          })
        ).filter((offer) => offer.benefit.isActive && offer.benefit.type !== 'free_shipping')
      : []
    const productIds = [...new Set(variants.map((variant) => variant.productId))]
    const inRange = new Map<number, number[]>()
    for (const offer of memberOffers) {
      inRange.set(offer.id, await this.getProductIdsInOfferRange(offer.condition.rangeId, productIds))
    }

    for (const variant of variants) {
      if ((variant.discountedPrice ?? variant.price) === null) continue
      // A cart of one unit, for the cart's own pricing
      const oneUnit = () => {
        const discounts = { siteOfferDiscounts: [], userOfferDiscounts: [], voucherOfferDiscounts: [], totalOfferDiscount: 0 }
        return {
          ...discounts,
          notCombinedVoucherOffers: [],
          lines: [{ ...structuredClone(discounts), variant, quantity: 1 }],
        } as unknown as CartContent
      }
      for (const plan of plans) {
        const forPlan = memberOffers.filter(
          (offer) => offer.includedMembershipPlanIds.includes(plan.id) && inRange.get(offer.id)!.includes(variant.productId),
        )
        if (!forPlan.length) continue
        const ids = [variant.productId]
        const combined = oneUnit()
        const candidates = [combined]
        for (const offer of forPlan) {
          if (!offer.combinesWithOtherOffers) {
            const alone = oneUnit()
            applyBenefit(offer, alone, ids, 'user')
            candidates.push(alone)
          } else if (!isFullyDiscounted(combined, ids)) {
            applyBenefit(offer, combined, ids, 'user')
          }
        }
        const discount = Math.max(...candidates.map((candidate) => candidate.totalOfferDiscount))
        if (discount <= 0) continue
        const price = new Decimal(variant.discountedPrice ?? variant.price!).sub(discount).toString()
        const current = prices.get(variant.id)
        if (!current || new Decimal(price).lt(current.price)) {
          prices.set(variant.id, { planId: plan.id, planName: plan.name, price })
        }
      }
    }
    return prices
  }

  async increaseUsage(offerId: number, userId: string) {
    return await this.increaseUsageMultiple([offerId], userId)
  }

  // Without a userId (guest orders) only the offers' overall count goes up
  async increaseUsageMultiple(offerIds: number[], userId?: string | null) {
    const uniqueOfferIds = [...new Set(offerIds)]
    if (!uniqueOfferIds.length) {
      return
    }
    return await this.db.transaction(async (tx) => {
      if (userId) {
        await tx
          .insert(offerUsages)
          .values(
            uniqueOfferIds.map((offerId) => ({
              offerId,
              userId,
              usageCount: 1,
            })),
          )
          .onConflictDoUpdate({
            target: [offerUsages.offerId, offerUsages.userId],
            set: {
              usageCount: sql`${offerUsages.usageCount} + 1`,
            },
          })
      }

      await tx
        .update(offers)
        .set({
          usageCount: sql`${offers.usageCount} + 1`,
        })
        .where(inArray(offers.id, uniqueOfferIds))
    })
  }

  // Without a userId (guest orders) only the offer's overall count goes down
  async decreaseUsage(offerId: number, userId?: string | null) {
    return await this.db.transaction(async (tx) => {
      if (!userId) {
        await tx
          .update(offers)
          .set({
            usageCount: sql`${offers.usageCount} - 1`,
          })
          .where(and(eq(offers.id, offerId), gt(offers.usageCount, 0)))
        return
      }
      const [offerUsage] = await tx
        .update(offerUsages)
        .set({
          usageCount: sql`${offerUsages.usageCount} - 1`,
        })
        .where(
          and(
            eq(offerUsages.offerId, offerId),
            eq(offerUsages.userId, userId),
            gt(offerUsages.usageCount, 0),
          ),
        )
        .returning()

      if (!offerUsage) {
        return
      }
      await tx
        .update(offers)
        .set({
          usageCount: sql`${offers.usageCount} - 1`,
        })
        .where(and(eq(offers.id, offerId), gt(offers.usageCount, 0)))
    })
  }

  async createApplicationLog(data: NewOfferApplicationLog) {
    const [log] = await this.db
      .insert(offerApplicationLogs)
      .values(data)
      .returning()
    return log
  }

  async createApplicationLogs(data: NewOfferApplicationLog[]) {
    return await this.db.insert(offerApplicationLogs).values(data)
  }
}

export {
  hasFreeShipping,
  OfferBenefitService,
  OfferConditionService,
  OfferRangeService,
  OfferService,
  withoutOffers,
}
