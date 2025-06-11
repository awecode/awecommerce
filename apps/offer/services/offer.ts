import { CartContent, Database } from '../../types'
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
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
import {
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
  UpdateOfferBenefit,
  UpdateOfferRange,
} from '../schemas'

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
    const [offerRange] = await this.db
      .insert(offerRanges)
      .values(data)
      .returning()
    if (data.includedProducts && data.includedProducts.length) {
      await this.db.insert(offerRangeIncludedProducts).values(
        data.includedProducts.map((productId) => ({
          rangeId: offerRange.id,
          productId,
        })),
      )
    }
    if (data.excludedProducts && data.excludedProducts.length) {
      await this.db.insert(offerRangeExcludedProducts).values(
        data.excludedProducts.map((productId) => ({
          rangeId: offerRange.id,
          productId,
        })),
      )
    }
    if (data.includedCategories && data.includedCategories.length) {
      await this.db.insert(offerRangeIncludedCategories).values(
        data.includedCategories.map((categoryId) => ({
          rangeId: offerRange.id,
          categoryId,
        })),
      )
    }
    if (data.excludedCategories && data.excludedCategories.length) {
      await this.db.insert(offerRangeExcludedCategories).values(
        data.excludedCategories.map((categoryId) => ({
          rangeId: offerRange.id,
          categoryId,
        })),
      )
    }
    if (data.includedBrands && data.includedBrands.length) {
      await this.db.insert(offerRangeIncludedBrands).values(
        data.includedBrands.map((brandId) => ({
          rangeId: offerRange.id,
          brandId,
        })),
      )
    }
    if (data.excludedBrands && data.excludedBrands.length) {
      await this.db.insert(offerRangeExcludedBrands).values(
        data.excludedBrands.map((brandId) => ({
          rangeId: offerRange.id,
          brandId,
        })),
      )
    }
    if (data.includedProductClasses && data.includedProductClasses.length) {
      await this.db.insert(offerRangeIncludedProductClasses).values(
        data.includedProductClasses.map((productClassId) => ({
          rangeId: offerRange.id,
          productClassId,
        })),
      )
    }
    if (data.excludedProductClasses && data.excludedProductClasses.length) {
      await this.db.insert(offerRangeExcludedProductClasses).values(
        data.excludedProductClasses.map((productClassId) => ({
          rangeId: offerRange.id,
          productClassId,
        })),
      )
    }
    return offerRange
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
    }
  }

  async update(id: number, data: UpdateOfferRange) {
    const [offerRange] = await this.db
      .update(offerRanges)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerRanges.id, id))
      .returning()
    if (data.includedProducts) {
      await this.db
        .delete(offerRangeIncludedProducts)
        .where(eq(offerRangeIncludedProducts.rangeId, id))
      if (data.includedProducts.length > 0) {
        await this.db.insert(offerRangeIncludedProducts).values(
          data.includedProducts.map((productId) => ({
            rangeId: id,
            productId,
          })),
        )
      }
    }
    if (data.excludedProducts) {
      await this.db
        .delete(offerRangeExcludedProducts)
        .where(eq(offerRangeExcludedProducts.rangeId, id))
      if (data.excludedProducts.length > 0) {
        await this.db.insert(offerRangeExcludedProducts).values(
          data.excludedProducts.map((productId) => ({
            rangeId: id,
            productId,
          })),
        )
      }
    }
    if (data.includedCategories) {
      await this.db
        .delete(offerRangeIncludedCategories)
        .where(eq(offerRangeIncludedCategories.rangeId, id))
      if (data.includedCategories.length > 0) {
        await this.db.insert(offerRangeIncludedCategories).values(
          data.includedCategories.map((categoryId) => ({
            rangeId: id,
            categoryId,
          })),
        )
      }
    }
    if (data.excludedCategories) {
      await this.db
        .delete(offerRangeExcludedCategories)
        .where(eq(offerRangeExcludedCategories.rangeId, id))
      if (data.excludedCategories.length > 0) {
        await this.db.insert(offerRangeExcludedCategories).values(
          data.excludedCategories.map((categoryId) => ({
            rangeId: id,
            categoryId,
          })),
        )
      }
    }
    if (data.includedBrands) {
      await this.db
        .delete(offerRangeIncludedBrands)
        .where(eq(offerRangeIncludedBrands.rangeId, id))
      if (data.includedBrands.length > 0) {
        await this.db.insert(offerRangeIncludedBrands).values(
          data.includedBrands.map((brandId) => ({
            rangeId: id,
            brandId,
          })),
        )
      }
    }
    if (data.excludedBrands) {
      await this.db
        .delete(offerRangeExcludedBrands)
        .where(eq(offerRangeExcludedBrands.rangeId, id))
      if (data.excludedBrands.length > 0) {
        await this.db.insert(offerRangeExcludedBrands).values(
          data.excludedBrands.map((brandId) => ({
            rangeId: id,
            brandId,
          })),
        )
      }
    }
    if (data.includedProductClasses) {
      await this.db
        .delete(offerRangeIncludedProductClasses)
        .where(eq(offerRangeIncludedProductClasses.rangeId, id))
      if (data.includedProductClasses.length > 0) {
        await this.db.insert(offerRangeIncludedProductClasses).values(
          data.includedProductClasses.map((productClassId) => ({
            rangeId: id,
            productClassId,
          })),
        )
      }
    }
    if (data.excludedProductClasses) {
      await this.db
        .delete(offerRangeExcludedProductClasses)
        .where(eq(offerRangeExcludedProductClasses.rangeId, id))
      if (data.excludedProductClasses.length > 0) {
        await this.db.insert(offerRangeExcludedProductClasses).values(
          data.excludedProductClasses.map((productClassId) => ({
            rangeId: id,
            productClassId,
          })),
        )
      }
    }
    return offerRange
  }

  async delete(id: number) {
    return await this.db.delete(offerRanges).where(eq(offerRanges.id, id))
  }

  async list(filters: OfferRangeListFilter) {
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
    if (!filters.pagination) {
      return await query
    }

    const { page, size } = filters.pagination

    const results = await query.limit(size).offset((page - 1) * size)

    const total = await this.db.$count(offerRanges, and(...where))

    return {
      results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
    return offerBenefit
  }

  async delete(id: number) {
    return await this.db.delete(offerBenefits).where(eq(offerBenefits.id, id))
  }

  async list(filters: OfferBenefitListFilter) {
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
    if (!filters.pagination) {
      return await query
    }

    const { page, size } = filters.pagination

    const results = await query.limit(size).offset((page - 1) * size)

    const total = await this.db.$count(offerBenefits, and(...where))

    return {
      results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
    return offerCondition
  }

  async delete(id: number) {
    return await this.db
      .delete(offerConditions)
      .where(eq(offerConditions.id, id))
  }

  async list(filters: OfferConditionListFilter) {
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
    if (!filters.pagination) {
      return await query
    }

    const { page, size } = filters.pagination

    const results = await query.limit(size).offset((page - 1) * size)

    const total = await this.db.$count(offerConditions, and(...where))

    return {
      results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
}

interface ActiveUserOfferListFilter {
  type?: 'voucher' | 'user'
  isFeatured?: boolean
}

class OfferService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(data: any) {
    const [offer] = await this.db.insert(offers).values(data).returning()
    return offer
  }

  async get(id: number) {
    return await this.db.query.offers.findFirst({
      where: eq(offers.id, id),
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

  async update(id: number, data: any) {
    const [offer] = await this.db
      .update(offers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offers.id, id))
      .returning()
    return offer
  }

  async delete(id: number) {
    return await this.db.delete(offers).where(eq(offers.id, id))
  }

  async list(filters: OfferListFilter) {
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

    const query = this.db
      .select()
      .from(offers)
      .where(and(...where))
      .orderBy(desc(offers.createdAt))
    if (!filters.pagination) {
      return await query
    }

    const { page, size } = filters.pagination

    const results = await query.limit(size).offset((page - 1) * size)

    const total = await this.db.$count(offers, and(...where))

    return {
      results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
    userId: string,
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
      .where(
        and(
          ...where,
          eq(offers.isActive, true),
          or(
            eq(offers.includeAllUsers, true),
            sql`'${sql.raw(userId)}' IN (SELECT jsonb_array_elements_text(${
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
      .having(
        or(
          isNull(offers.limitPerUser),
          lt(
            sql`COALESCE((SELECT ${
              offerUsages.usageCount
            } FROM ${offerUsages} WHERE ${offerUsages.offerId} = ${
              offers.id
            } AND ${offerUsages.userId} = '${sql.raw(userId)}'), 0)`,
            offers.limitPerUser,
          ),
        ),
      )
      .groupBy(offers.id, offerBenefits.id, offerConditions.id)
      .orderBy(desc(offers.priority), desc(offers.createdAt))
  }

  async getActiveApplicableVoucherOffers(userId: string, productIds: number[]) {
    const now = new Date().toISOString();

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
      .where(
        and(
          eq(offers.type, 'voucher'),
          eq(offers.isActive, true),
          or(
            eq(offers.includeAllUsers, true),
            sql`'${sql.raw(userId)}' IN (SELECT jsonb_array_elements_text(${offers.includedUserIds}))`,
          ),
          or(isNull(offers.startDate), lte(offers.startDate, now)),
          or(isNull(offers.endDate), gte(offers.endDate, now)),
          or(
            isNull(offers.overallLimit),
            lt(offers.usageCount, offers.overallLimit),
          ),
          sql`
            EXISTS (
              SELECT 1 FROM ${products}
              LEFT JOIN ${brands} ON ${products.brandId} = ${brands.id}
              LEFT JOIN ${categories} ON ${products.categoryId} = ${categories.id}
              LEFT JOIN ${productClasses} ON ${products.productClassId} = ${productClasses.id}
              WHERE ${products.id} IN (${sql.join(productIds, sql.raw)})
              AND EXISTS (
                SELECT 1 FROM ${offerRanges}
                WHERE ${offerRanges.id} = ${offerConditions.rangeId}
                AND ${offerRanges.isActive} = true
                AND (
                  (${offerRanges.inclusiveFilter} = true AND (
                    (${offerRanges.includeAllProducts} = true OR EXISTS (
                      SELECT 1 FROM ${offerRangeIncludedProducts}
                      WHERE ${offerRangeIncludedProducts.productId} = ${products.id}
                      AND ${offerRangeIncludedProducts.rangeId} = ${offerRanges.id}
                    ))
                    AND NOT EXISTS (
                      SELECT 1 FROM ${offerRangeExcludedProducts}
                      WHERE ${offerRangeExcludedProducts.productId} = ${products.id}
                      AND ${offerRangeExcludedProducts.rangeId} = ${offerRanges.id}
                    )
                    AND (${offerRanges.includeAllBrands} = true OR EXISTS (
                      SELECT 1 FROM ${offerRangeIncludedBrands}
                      WHERE ${offerRangeIncludedBrands.brandId} = ${products.brandId}
                      AND ${offerRangeIncludedBrands.rangeId} = ${offerRanges.id}
                    ))
                    AND NOT EXISTS (
                      SELECT 1 FROM ${offerRangeExcludedBrands}
                      WHERE ${offerRangeExcludedBrands.brandId} = ${products.brandId}
                      AND ${offerRangeExcludedBrands.rangeId} = ${offerRanges.id}
                    )
                    AND (${offerRanges.includeAllCategories} = true OR EXISTS (
                      SELECT 1 FROM ${offerRangeIncludedCategories}
                      WHERE (${offerRangeIncludedCategories.categoryId} = ${products.categoryId} OR ${offerRangeIncludedCategories.categoryId} = ${products.subCategoryId})
                      AND ${offerRangeIncludedCategories.rangeId} = ${offerRanges.id}
                    ))
                    AND NOT EXISTS (
                      SELECT 1 FROM ${offerRangeExcludedCategories}
                      WHERE (${offerRangeExcludedCategories.categoryId} = ${products.categoryId} OR ${offerRangeExcludedCategories.categoryId} = ${products.subCategoryId})
                      AND ${offerRangeExcludedCategories.rangeId} = ${offerRanges.id}
                    )
                    AND (${offerRanges.includeAllProductClasses} = true OR EXISTS (
                      SELECT 1 FROM ${offerRangeIncludedProductClasses}
                      WHERE ${offerRangeIncludedProductClasses.productClassId} = ${products.productClassId}
                      AND ${offerRangeIncludedProductClasses.rangeId} = ${offerRanges.id}
                    ))
                    AND NOT EXISTS (
                      SELECT 1 FROM ${offerRangeExcludedProductClasses}
                      WHERE ${offerRangeExcludedProductClasses.productClassId} = ${products.productClassId}
                      AND ${offerRangeExcludedProductClasses.rangeId} = ${offerRanges.id}
                    )
                  ))
                  OR
                  (${offerRanges.inclusiveFilter} = false AND (
                    (
                      (${offerRanges.includeAllProducts} = true OR EXISTS (
                        SELECT 1 FROM ${offerRangeIncludedProducts}
                        WHERE ${offerRangeIncludedProducts.productId} = ${products.id}
                        AND ${offerRangeIncludedProducts.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                        SELECT 1 FROM ${offerRangeExcludedProducts}
                        WHERE ${offerRangeExcludedProducts.productId} = ${products.id}
                        AND ${offerRangeExcludedProducts.rangeId} = ${offerRanges.id}
                      )
                    )
                    OR (
                      (${offerRanges.includeAllBrands} = true OR EXISTS (
                        SELECT 1 FROM ${offerRangeIncludedBrands}
                        WHERE ${offerRangeIncludedBrands.brandId} = ${products.brandId}
                        AND ${offerRangeIncludedBrands.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                        SELECT 1 FROM ${offerRangeExcludedBrands}
                        WHERE ${offerRangeExcludedBrands.brandId} = ${products.brandId}
                        AND ${offerRangeExcludedBrands.rangeId} = ${offerRanges.id}
                      )
                    )
                    OR (
                      (${offerRanges.includeAllCategories} = true OR EXISTS (
                        SELECT 1 FROM ${offerRangeIncludedCategories}
                        WHERE (${offerRangeIncludedCategories.categoryId} = ${products.categoryId} OR ${offerRangeIncludedCategories.categoryId} = ${products.subCategoryId})
                        AND ${offerRangeIncludedCategories.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                        SELECT 1 FROM ${offerRangeExcludedCategories}
                        WHERE (${offerRangeExcludedCategories.categoryId} = ${products.categoryId} OR ${offerRangeExcludedCategories.categoryId} = ${products.subCategoryId})
                        AND ${offerRangeExcludedCategories.rangeId} = ${offerRanges.id}
                      )
                    )
                    OR (
                      (${offerRanges.includeAllProductClasses} = true OR EXISTS (
                        SELECT 1 FROM ${offerRangeIncludedProductClasses}
                        WHERE ${offerRangeIncludedProductClasses.productClassId} = ${products.productClassId}
                        AND ${offerRangeIncludedProductClasses.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                        SELECT 1 FROM ${offerRangeExcludedProductClasses}
                        WHERE ${offerRangeExcludedProductClasses.productClassId} = ${products.productClassId}
                        AND ${offerRangeExcludedProductClasses.rangeId} = ${offerRanges.id}
                      )
                    )
                  ))
                )
              )
            )
          `,
        ),
      )
      .leftJoin(offerBenefits, eq(offers.benefitId, offerBenefits.id))
      .having(
        or(
          isNull(offers.limitPerUser),
          lt(
            sql`COALESCE((SELECT ${offerUsages.usageCount} FROM ${offerUsages} WHERE ${offerUsages.offerId} = ${offers.id} AND ${offerUsages.userId} = '${sql.raw(userId)}'), 0)`,
            offers.limitPerUser,
          ),
        ),
      )
      .groupBy(offers.id, offerBenefits.id, offerConditions.id)
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
            sql`'${sql.raw(userId)}' IN (SELECT jsonb_array_elements_text(${
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
        price: products.price,
        discount: products.discountedPrice,
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
              AND (
                  (${offerRanges.inclusiveFilter} = true AND (
                      (${offerRanges.includeAllProducts} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedProducts}
                          WHERE ${offerRangeIncludedProducts.productId} = ${products.id}
                          AND ${offerRangeIncludedProducts.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedProducts}
                          WHERE ${offerRangeExcludedProducts.productId} = ${products.id}
                          AND ${offerRangeExcludedProducts.rangeId} = ${offerRanges.id}
                      )
                      AND (${offerRanges.includeAllBrands} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedBrands}
                          WHERE ${offerRangeIncludedBrands.brandId} = ${products.brandId}
                          AND ${offerRangeIncludedBrands.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedBrands}
                          WHERE ${offerRangeExcludedBrands.brandId} = ${products.brandId}
                          AND ${offerRangeExcludedBrands.rangeId} = ${offerRanges.id}
                      )
                      AND (${offerRanges.includeAllCategories} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedCategories}
                          WHERE ${offerRangeIncludedCategories.categoryId} = ${products.categoryId}
                          OR ${offerRangeIncludedCategories.categoryId} = ${products.subCategoryId}
                          AND ${offerRangeIncludedCategories.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedCategories}
                          WHERE ${offerRangeExcludedCategories.categoryId} = ${products.categoryId}
                          OR ${offerRangeExcludedCategories.categoryId} = ${products.subCategoryId}
                          AND ${offerRangeExcludedCategories.rangeId} = ${offerRanges.id}
                      )
                      AND (${offerRanges.includeAllProductClasses} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedProductClasses}
                          WHERE ${offerRangeIncludedProductClasses.productClassId} = ${products.productClassId}
                          AND ${offerRangeIncludedProductClasses.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedProductClasses}
                          WHERE ${offerRangeExcludedProductClasses.productClassId} = ${products.productClassId}
                          AND ${offerRangeExcludedProductClasses.rangeId} = ${offerRanges.id}
                      )
                  ))
                  OR
                  (${offerRanges.inclusiveFilter} = false AND (
                      ((${offerRanges.includeAllProducts} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedProducts}
                          WHERE ${offerRangeIncludedProducts.productId} = ${products.id}
                          AND ${offerRangeIncludedProducts.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedProducts}
                          WHERE ${offerRangeExcludedProducts.productId} = ${products.id}
                          AND ${offerRangeExcludedProducts.rangeId} = ${offerRanges.id}
                      ))
                      OR ((${offerRanges.includeAllBrands} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedBrands}
                          WHERE ${offerRangeIncludedBrands.brandId} = ${products.brandId}
                          AND ${offerRangeIncludedBrands.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedBrands}
                          WHERE ${offerRangeExcludedBrands.brandId} = ${products.brandId}
                          AND ${offerRangeExcludedBrands.rangeId} = ${offerRanges.id}
                      ))
                      OR ((${offerRanges.includeAllCategories} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedCategories}
                          WHERE ${offerRangeIncludedCategories.categoryId} = ${products.categoryId}
                          OR ${offerRangeIncludedCategories.categoryId} = ${products.subCategoryId}
                          AND ${offerRangeIncludedCategories.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedCategories}
                          WHERE ${offerRangeExcludedCategories.categoryId} = ${products.categoryId}
                          OR ${offerRangeExcludedCategories.categoryId} = ${products.subCategoryId}
                          AND ${offerRangeExcludedCategories.rangeId} = ${offerRanges.id}
                      ))
                      OR ((${offerRanges.includeAllProductClasses} = true OR EXISTS (
                          SELECT 1 FROM ${offerRangeIncludedProductClasses}
                          WHERE ${offerRangeIncludedProductClasses.productClassId} = ${products.productClassId}
                          AND ${offerRangeIncludedProductClasses.rangeId} = ${offerRanges.id}
                      ))
                      AND NOT EXISTS (
                          SELECT 1 FROM ${offerRangeExcludedProductClasses}
                          WHERE ${offerRangeExcludedProductClasses.productClassId} = ${products.productClassId}
                          AND ${offerRangeExcludedProductClasses.rangeId} = ${offerRanges.id}
                      ))
                  ))
              )
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
    if (
      !voucherOffer ||
      voucherOffer.type !== 'voucher' ||
      !voucherOffer.isActive ||
      (voucherOffer.includeAllUsers === false &&
        !voucherOffer.includedUserIds.includes(userId)) ||
      (voucherOffer.startDate &&
        new Date(voucherOffer.startDate) > new Date()) ||
      (voucherOffer.endDate && new Date(voucherOffer.endDate) < new Date())
    ) {
      throw new Error('Invalid voucher code')
    }

    if (
      voucherOffer.overallLimit &&
      voucherOffer.usageCount &&
      voucherOffer.usageCount >= voucherOffer.overallLimit
    ) {
      throw new Error('Voucher code usage limit exceeded')
    }

    if (voucherOffer.limitPerUser) {
      if (!userId) {
        throw new Error('User id is required to validate voucher code')
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
        throw new Error('Voucher code usage limit exceeded')
      }
    }

    if (
      await this.db.query.cartAppliedVoucherOffers.findFirst({
        where: and(
          eq(offerUsages.offerId, voucherOffer.id),
          eq(cartAppliedVoucherOffers.cartId, cartContent.id),
        ),
      })
    ) {
      throw new Error('Voucher code already used in this cart')
    }

    const cartLines = cartContent.lines

    if (!voucherOffer.benefit.isActive) {
      return cartContent
    }

    const productIds = cartLines.map((line) => line.productId)

    const productIdsInOfferRange = await this.getProductIdsInOfferRange(
      voucherOffer.condition.rangeId,
      productIds,
    )

    if (productIdsInOfferRange.length === 0) {
      throw new Error(
        'Voucher code is not applicable to any product in the cart',
      )
    }

    const cartLinesOfProductsInOfferRange = cartLines.filter((line) =>
      productIdsInOfferRange.includes(line.productId),
    )

    let isVoucherApplied = false

    if (
      cartLinesOfProductsInOfferRange.every(
        (line) =>
          line.totalOfferDiscount >=
          Number(line.product.discountedPrice ?? line.product.price) *
            line.quantity,
      )
    ) {
      throw new Error('Discount already applied to all applicable products')
    }

    if (voucherOffer.condition.type === 'basket_quantity') {
      const productQuantities = cartLinesOfProductsInOfferRange.reduce(
        (acc: Record<number, number>, line) => {
          acc[line.productId] = (acc[line.productId] || 0) + line.quantity
          return acc
        },
        {} as Record<number, number>,
      )

      if (
        !productIdsInOfferRange.some(
          (id) => productQuantities[id] >= Number(voucherOffer.condition.value),
        )
      ) {
        throw new Error(
          'Voucher code is not applicable to any product in the cart',
        )
      }

      for (const line of cartLinesOfProductsInOfferRange) {
        if (
          productQuantities[line.productId] >=
          Number(voucherOffer.condition.value)
        ) {
          if (voucherOffer.benefit.maxAffectedItems) {
            let discountAppliedTo = 0
            for (let i = 0; i < line.quantity; i++) {
              if (
                voucherOffer.benefit.maxAffectedItems &&
                discountAppliedTo >= voucherOffer.benefit.maxAffectedItems
              ) {
                break
              }
              if (voucherOffer.benefit.type === 'fixed_amount') {
                const updatedLine = cartContent.lines.find(
                  (l) => l.productId === line.productId,
                )
                let offerDiscount = Number(voucherOffer.benefit.value)
                if (
                  updatedLine!.totalOfferDiscount + offerDiscount >
                  Number((line.product.discountedPrice ?? line.product.price)!)
                ) {
                  offerDiscount =
                    Number(
                      (line.product.discountedPrice ?? line.product.price)!,
                    ) - updatedLine!.totalOfferDiscount
                }
                updatedLine!.voucherOfferDiscounts.push({
                  id: voucherOffer.id,
                  name: voucherOffer.name,
                  discount: offerDiscount,
                  voucherCode: voucherOffer.voucherCode,
                  benefitType: voucherOffer.benefit.type,
                  benefitValue: voucherOffer.benefit.value,
                  conditionType: voucherOffer.condition.type,
                  conditionValue: voucherOffer.condition.value,
                })
                cartContent.voucherOfferDiscounts.push({
                  id: voucherOffer.id,
                  name: voucherOffer.name,
                  discount: offerDiscount,
                  voucherCode: voucherOffer.voucherCode,
                  benefitType: voucherOffer.benefit.type,
                  benefitValue: voucherOffer.benefit.value,
                  conditionType: voucherOffer.condition.type,
                  conditionValue: voucherOffer.condition.value,
                })
                updatedLine!.totalOfferDiscount += offerDiscount
                cartContent.totalOfferDiscount += offerDiscount
                isVoucherApplied = true
              } else if (voucherOffer.benefit.type === 'percentage') {
                const updatedLine = cartContent.lines.find(
                  (l) => l.productId === line.productId,
                )
                let offerDiscount =
                  (Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    Number(voucherOffer.benefit.value)) /
                  100
                if (
                  updatedLine!.totalOfferDiscount + offerDiscount >
                  Number((line.product.discountedPrice ?? line.product.price)!)
                ) {
                  offerDiscount =
                    Number(
                      (line.product.discountedPrice ?? line.product.price)!,
                    ) - updatedLine!.totalOfferDiscount
                }
                updatedLine!.voucherOfferDiscounts.push({
                  id: voucherOffer.id,
                  name: voucherOffer.name,
                  discount: offerDiscount,
                  voucherCode: voucherOffer.voucherCode,
                  benefitType: voucherOffer.benefit.type,
                  benefitValue: voucherOffer.benefit.value,
                  conditionType: voucherOffer.condition.type,
                  conditionValue: voucherOffer.condition.value,
                })
                cartContent.voucherOfferDiscounts.push({
                  id: voucherOffer.id,
                  name: voucherOffer.name,
                  discount: offerDiscount,
                  voucherCode: voucherOffer.voucherCode,
                  benefitType: voucherOffer.benefit.type,
                  benefitValue: voucherOffer.benefit.value,
                  conditionType: voucherOffer.condition.type,
                  conditionValue: voucherOffer.condition.value,
                })
                updatedLine!.totalOfferDiscount += offerDiscount
                cartContent.totalOfferDiscount += offerDiscount
                isVoucherApplied = true
              } else {
                throw new Error('Not implemented')
              }
              discountAppliedTo += 1
            }
          } else {
            if (voucherOffer.benefit.type === 'fixed_amount') {
              const updatedLine = cartContent.lines.find(
                (l) => l.productId === line.productId,
              )
              let offerDiscount =
                Number(voucherOffer.benefit.value) * line.quantity
              if (
                updatedLine!.totalOfferDiscount + offerDiscount >
                Number((line.product.discountedPrice ?? line.product.price)!) *
                  line.quantity
              ) {
                offerDiscount =
                  Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    line.quantity -
                  updatedLine!.totalOfferDiscount
              }
              updatedLine!.voucherOfferDiscounts.push({
                id: voucherOffer.id,
                name: voucherOffer.name,
                discount: offerDiscount,
                voucherCode: voucherOffer.voucherCode,
                benefitType: voucherOffer.benefit.type,
                benefitValue: voucherOffer.benefit.value,
                conditionType: voucherOffer.condition.type,
                conditionValue: voucherOffer.condition.value,
              })
              cartContent.voucherOfferDiscounts.push({
                id: voucherOffer.id,
                name: voucherOffer.name,
                discount: offerDiscount,
                voucherCode: voucherOffer.voucherCode,
                benefitType: voucherOffer.benefit.type,
                benefitValue: voucherOffer.benefit.value,
                conditionType: voucherOffer.condition.type,
                conditionValue: voucherOffer.condition.value,
              })
              updatedLine!.totalOfferDiscount += offerDiscount
              cartContent.totalOfferDiscount += offerDiscount
              isVoucherApplied = true
            } else if (voucherOffer.benefit.type === 'percentage') {
              const updatedLine = cartContent.lines.find(
                (l) => l.productId === line.productId,
              )
              let offerDiscount =
                ((Number(
                  (line.product.discountedPrice ?? line.product.price)!,
                ) *
                  Number(voucherOffer.benefit.value)) /
                  100) *
                line.quantity
              if (
                updatedLine!.totalOfferDiscount + offerDiscount >
                Number((line.product.discountedPrice ?? line.product.price)!) *
                  line.quantity
              ) {
                offerDiscount =
                  Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    line.quantity -
                  updatedLine!.totalOfferDiscount
              }
              updatedLine!.voucherOfferDiscounts.push({
                id: voucherOffer.id,
                name: voucherOffer.name,
                discount: offerDiscount,
                voucherCode: voucherOffer.voucherCode,
                benefitType: voucherOffer.benefit.type,
                benefitValue: voucherOffer.benefit.value,
                conditionType: voucherOffer.condition.type,
                conditionValue: voucherOffer.condition.value,
              })
              cartContent.voucherOfferDiscounts.push({
                id: voucherOffer.id,
                name: voucherOffer.name,
                discount: offerDiscount,
                voucherCode: voucherOffer.voucherCode,
                benefitType: voucherOffer.benefit.type,
                benefitValue: voucherOffer.benefit.value,
                conditionType: voucherOffer.condition.type,
                conditionValue: voucherOffer.condition.value,
              })
              updatedLine!.totalOfferDiscount += offerDiscount
              cartContent.totalOfferDiscount += offerDiscount
              isVoucherApplied = true
            } else {
              throw new Error('Not implemented')
            }
          }
        }
      }
      if (!isVoucherApplied) {
        throw new Error(
          'Voucher code is not applicable to any product in the cart',
        )
      }
      await this.db.insert(cartAppliedVoucherOffers).values({
        cartId: cartContent.id,
        offerId: voucherOffer.id,
      })
      return cartContent
    }
    throw new Error('Not implemented')
  }

  async applyUserOffer(
    offer: any,
    cartContent: CartContent,
  ): Promise<CartContent> {
    const productIds = cartContent.lines.map((line) => line.productId)
    const productIdsInOfferRange = await this.getProductIdsInOfferRange(
      offer.condition.rangeId,
      productIds,
    )

    const cartLinesOfProductsInOfferRange = cartContent.lines.filter((line) =>
      productIdsInOfferRange.includes(line.productId),
    )

    if (
      cartLinesOfProductsInOfferRange.every(
        (line) =>
          line.totalOfferDiscount >=
          Number(line.product.discountedPrice ?? line.product.price) *
            line.quantity,
      )
    ) {
      return cartContent
    }

    if (!offer.benefit.isActive) {
      return cartContent
    }

    if (offer.condition.type === 'basket_quantity') {
      const productQuantities = cartLinesOfProductsInOfferRange.reduce(
        (acc: Record<number, number>, line) => {
          acc[line.productId] = (acc[line.productId] || 0) + line.quantity
          return acc
        },
        {} as Record<number, number>,
      )

      for (const line of cartLinesOfProductsInOfferRange) {
        if (
          productQuantities[line.productId] >= Number(offer.condition.value)
        ) {
          if (offer.benefit.maxAffectedItems) {
            let discountAppliedTo = 0
            for (let i = 0; i < line.quantity; i++) {
              if (
                offer.benefit.maxAffectedItems &&
                discountAppliedTo >= offer.benefit.maxAffectedItems
              ) {
                break
              }
              if (offer.benefit.type === 'fixed_amount') {
                const updatedLine = cartContent.lines.find(
                  (l) => l.productId === line.productId,
                )
                let offerDiscount = Number(offer.benefit.value)
                if (
                  updatedLine!.totalOfferDiscount + offerDiscount >
                  Number((line.product.discountedPrice ?? line.product.price)!)
                ) {
                  offerDiscount =
                    Number(
                      (line.product.discountedPrice ?? line.product.price)!,
                    ) - updatedLine!.totalOfferDiscount
                }
                updatedLine!.userOfferDiscounts.push({
                  id: offer.id,
                  name: offer.name,
                  discount: offerDiscount,
                  benefitType: offer.benefit.type,
                  benefitValue: offer.benefit.value,
                  conditionType: offer.condition.type,
                  conditionValue: offer.condition.value,
                })
                cartContent.userOfferDiscounts.push({
                  id: offer.id,
                  name: offer.name,
                  discount: offerDiscount,
                  benefitType: offer.benefit.type,
                  benefitValue: offer.benefit.value,
                  conditionType: offer.condition.type,
                  conditionValue: offer.condition.value,
                })
                updatedLine!.totalOfferDiscount += offerDiscount
                cartContent.totalOfferDiscount += offerDiscount
              } else if (offer.benefit.type === 'percentage') {
                const updateLine = cartContent.lines.find(
                  (l) => l.productId === line.productId,
                )
                let offerDiscount =
                  (Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    Number(offer.benefit.value)) /
                  100
                if (
                  updateLine!.totalOfferDiscount + offerDiscount >
                  Number((line.product.discountedPrice ?? line.product.price)!)
                ) {
                  offerDiscount =
                    Number(
                      (line.product.discountedPrice ?? line.product.price)!,
                    ) - updateLine!.totalOfferDiscount
                }
                updateLine!.userOfferDiscounts.push({
                  id: offer.id,
                  name: offer.name,
                  discount: offerDiscount,
                  benefitType: offer.benefit.type,
                  benefitValue: offer.benefit.value,
                  conditionType: offer.condition.type,
                  conditionValue: offer.condition.value,
                })
                cartContent.userOfferDiscounts.push({
                  id: offer.id,
                  name: offer.name,
                  discount: offerDiscount,
                  benefitType: offer.benefit.type,
                  benefitValue: offer.benefit.value,
                  conditionType: offer.condition.type,
                  conditionValue: offer.condition.value,
                })
                updateLine!.totalOfferDiscount += offerDiscount
                cartContent.totalOfferDiscount += offerDiscount
              } else {
                throw new Error('Not implemented')
              }
              discountAppliedTo += 1
            }
          } else {
            if (offer.benefit.type === 'fixed_amount') {
              const updatedLine = cartContent.lines.find(
                (l) => l.productId === line.productId,
              )
              let offerDiscount = Number(offer.benefit.value) * line.quantity
              if (
                updatedLine!.totalOfferDiscount + offerDiscount >
                Number((line.product.discountedPrice ?? line.product.price)!) *
                  line.quantity
              ) {
                offerDiscount =
                  Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    line.quantity -
                  updatedLine!.totalOfferDiscount
              }
              updatedLine!.userOfferDiscounts.push({
                id: offer.id,
                name: offer.name,
                discount: offerDiscount,
                benefitType: offer.benefit.type,
                benefitValue: offer.benefit.value,
                conditionType: offer.condition.type,
                conditionValue: offer.condition.value,
              })
              cartContent.userOfferDiscounts.push({
                id: offer.id,
                name: offer.name,
                discount: offerDiscount,
                benefitType: offer.benefit.type,
                benefitValue: offer.benefit.value,
                conditionType: offer.condition.type,
                conditionValue: offer.condition.value,
              })
              updatedLine!.totalOfferDiscount += offerDiscount
              cartContent.totalOfferDiscount += offerDiscount
            } else if (offer.benefit.type === 'percentage') {
              const updatedLine = cartContent.lines.find(
                (l) => l.productId === line.productId,
              )
              let offerDiscount =
                ((Number(
                  (line.product.discountedPrice ?? line.product.price)!,
                ) *
                  Number(offer.benefit.value)) /
                  100) *
                line.quantity
              if (
                updatedLine!.totalOfferDiscount + offerDiscount >
                Number((line.product.discountedPrice ?? line.product.price)!) *
                  line.quantity
              ) {
                offerDiscount =
                  Number(
                    (line.product.discountedPrice ?? line.product.price)!,
                  ) *
                    line.quantity -
                  updatedLine!.totalOfferDiscount
              }
              updatedLine!.userOfferDiscounts.push({
                id: offer.id,
                name: offer.name,
                discount: offerDiscount,
                benefitType: offer.benefit.type,
                benefitValue: offer.benefit.value,
                conditionType: offer.condition.type,
                conditionValue: offer.condition.value,
              })
              cartContent.userOfferDiscounts.push({
                id: offer.id,
                name: offer.name,
                discount: offerDiscount,
                benefitType: offer.benefit.type,
                benefitValue: offer.benefit.value,
                conditionType: offer.condition.type,
                conditionValue: offer.condition.value,
              })
              updatedLine!.totalOfferDiscount += offerDiscount
              cartContent.totalOfferDiscount += offerDiscount
            } else {
              throw new Error('Not implemented')
            }
          }
        }
      }
      return cartContent
    }
    throw new Error('Not implemented')
  }

  async increaseUsage(offerId: number, userId: string) {
    const [offerUsage] = await this.db
      .update(offerUsages)
      .set({
        usageCount: sql`${offerUsages.usageCount} + 1`,
      })
      .where(
        and(eq(offerUsages.offerId, offerId), eq(offerUsages.userId, userId)),
      )
      .returning()

    if (!offerUsage) {
      await this.db.insert(offerUsages).values({
        offerId,
        userId,
        usageCount: 1,
      })
    }
    await this.db
      .update(offers)
      .set({
        usageCount: sql`${offers.usageCount} + 1`,
      })
      .where(eq(offers.id, offerId))
  }

  async increaseUsageMultiple(offerIds: number[], userId: string) {
    const updatedOfferUsages = await this.db
      .update(offerUsages)
      .set({
        usageCount: sql`${offerUsages.usageCount} + 1`,
      })
      .where(
        and(
          inArray(offerUsages.offerId, offerIds),
          eq(offerUsages.userId, userId),
        ),
      )
      .returning()

    const existingOfferIds = updatedOfferUsages.map((o) => o.offerId)
    const newOfferIds = offerIds.filter((id) => !existingOfferIds.includes(id))

    if (newOfferIds.length > 0) {
      await this.db.insert(offerUsages).values(
        newOfferIds.map((id) => ({
          offerId: id,
          userId,
          usageCount: 1,
        })),
      )
    }

    await this.db
      .update(offers)
      .set({
        usageCount: sql`${offers.usageCount} + 1`,
      })
      .where(inArray(offers.id, offerIds))
  }

  async decreaseUsage(offerId: number, userId: string) {
    await this.db
      .update(offerUsages)
      .set({
        usageCount: sql`${offerUsages.usageCount} - 1`,
      })
      .where(
        and(eq(offerUsages.offerId, offerId), eq(offerUsages.userId, userId)),
      )
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
  OfferBenefitService,
  OfferConditionService,
  OfferRangeService,
  OfferService,
}
