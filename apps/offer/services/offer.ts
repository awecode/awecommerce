import { and, desc, eq, ilike, SQL } from 'drizzle-orm'
import {
  NewOfferRange,
  offerRanges,
  offerRangeExcludedProducts,
  offerRangeIncludedProducts,
  offerRangeIncludedBrands,
  offerRangeIncludedCategories,
  offerRangeIncludedProductClasses,
  UpdateOfferRange,
  NewOfferBenefit,
  offerBenefits,
  UpdateOfferBenefit,
  offerConditions,
  offers,
  offerApplicationLogs,
  NewOfferApplicationLog,
  UpdateOfferApplicationLog,
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
  private db: any

  constructor(db: any) {
    this.db = db
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
    if (data.includedBrands && data.includedBrands.length) {
      await this.db.insert(offerRangeIncludedBrands).values(data.includedBrands)
    }
    if (data.includedProductClasses && data.includedProductClasses.length) {
      await this.db.insert(offerRangeIncludedProductClasses).values(
        data.includedProductClasses.map((productClassId) => ({
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
    return offerRange
  }

  async delete(id: number) {
    return await this.db
      .delete(offerRanges)
      .where(eq(offerRanges.id, id))
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
  private db: any

  constructor(db: any) {
    this.db = db
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
    return offerBenefit
  }

  async delete(id: number) {
    return await this.db
      .delete(offerBenefits)
      .where(eq(offerBenefits.id, id))
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


interface OfferConditionListFilter {
  pagination?: {
    page: number
    size: number
  }
  type?: 'basket_quantity' | 'basket_total' | 'distinct_items'
  range?: number
}

class OfferConditionService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: { rangeId: number; type: string; value: number }) {
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

  async update(id: number, data: { type?: string; value?: number }) {
    const [offerCondition] = await this.db
      .update(offerConditions)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerConditions.id, id))
    return offerCondition
  }

  async delete(id: number) {
    return await this.db
      .delete(offerConditions)
      .where(eq(offerConditions.id, id))
  }

  async list(filters: OfferConditionListFilter) {
    const where: SQL[] = []

    if (filters.type){
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
  type?: 'site' | 'product' | 'service'
  condition?: number
  benefit?: number
  isActive?: boolean
  isFeatured?: boolean
}

class OfferService {
  private db: any

  constructor(db: any) {
    this.db = db
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

  async update(id: number, data: any) {
    const [offer] =  await this.db
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
}

class OfferApplicationLogService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: NewOfferApplicationLog) {
    const [log] = await this.db
      .insert(offerApplicationLogs)
      .values(data)
      .returning()
    return log
  }

  async get(id: number) {
    return await this.db.query.offerApplicationLogs.findFirst({
      where: eq(offerApplicationLogs.id, id),
    })
  }

  async update(id: number, data: UpdateOfferApplicationLog) {
    const [log] = await this.db
      .update(offerApplicationLogs)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerApplicationLogs.id, id))
      .returning()
    return log
  }

  async delete(id: number) {
    return await this.db
      .delete(offerApplicationLogs)
      .where(eq(offerApplicationLogs.id, id))
  }
}

export {
  OfferRangeService,
  OfferBenefitService,
  OfferConditionService,
  OfferService,
  OfferApplicationLogService,
}
